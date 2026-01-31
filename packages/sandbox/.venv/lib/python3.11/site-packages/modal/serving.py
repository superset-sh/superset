# Copyright Modal Labs 2023
import multiprocessing
import platform
from collections.abc import AsyncGenerator
from multiprocessing.context import SpawnProcess
from multiprocessing.synchronize import Event
from typing import TYPE_CHECKING, Optional

from synchronicity.async_wrap import asynccontextmanager

from modal._output import OutputManager

from ._utils.async_utils import TaskContext, asyncify, synchronize_api
from ._utils.logger import logger
from ._watcher import watch
from .cli.import_refs import ImportRef, import_app_from_ref
from .client import _Client
from .config import config
from .output import _get_output_manager, enable_output
from .runner import _run_app, serve_update

if TYPE_CHECKING:
    import modal.app


def _run_serve(
    import_ref: ImportRef, existing_app_id: str, is_ready: Event, environment_name: str, show_progress: bool
):
    app = import_app_from_ref(import_ref, base_cmd="modal serve")

    with enable_output(show_progress=show_progress):
        serve_update(app, existing_app_id, is_ready, environment_name)


async def _restart_serve(
    import_ref: ImportRef, *, existing_app_id: str, environment_name: str, timeout: float = 5.0
) -> SpawnProcess:
    ctx = multiprocessing.get_context("spawn")  # Needed to reload the interpreter
    is_ready = ctx.Event()
    output_mgr = OutputManager.get()
    show_progress = output_mgr is not None
    p = ctx.Process(target=_run_serve, args=(import_ref, existing_app_id, is_ready, environment_name, show_progress))
    p.start()
    await asyncify(is_ready.wait)(timeout)
    # TODO(erikbern): we don't fail if the above times out, but that's somewhat intentional, since
    # the child process might build a huge image or similar
    return p


async def _terminate(proc: Optional[SpawnProcess], timeout: float = 5.0):
    if proc is None:
        return
    try:
        proc.terminate()
        await asyncify(proc.join)(timeout)
        if proc.exitcode is not None:
            if output_mgr := _get_output_manager():
                output_mgr.print(f"Serve process {proc.pid} terminated")
        else:
            if output_mgr := _get_output_manager():
                output_mgr.print(f"[red]Serve process {proc.pid} didn't terminate after {timeout}s, killing it[/red]")
            proc.kill()
    except ProcessLookupError:
        pass  # Child process already finished


async def _run_watch_loop(
    import_ref: ImportRef,
    *,
    app_id: str,
    watcher: AsyncGenerator[set[str], None],
    environment_name: str,
):
    unsupported_msg = None
    if platform.system() == "Windows":
        unsupported_msg = "Live-reload skipped. This feature is currently unsupported on Windows"
        " This can hopefully be fixed in a future version of Modal."

    if unsupported_msg:
        if output_mgr := _get_output_manager():
            async for _ in watcher:
                output_mgr.print(unsupported_msg)
    else:
        curr_proc = None
        try:
            async for trigger_files in watcher:
                logger.debug(f"The following files triggered an app update: {', '.join(trigger_files)}")
                await _terminate(curr_proc)
                curr_proc = await _restart_serve(import_ref, existing_app_id=app_id, environment_name=environment_name)
        finally:
            await _terminate(curr_proc)


@asynccontextmanager
async def _serve_app(
    app: "modal.app._App",
    import_ref: ImportRef,
    *,
    _watcher: Optional[AsyncGenerator[set[str], None]] = None,  # for testing
    environment_name: Optional[str] = None,
) -> AsyncGenerator["modal.app._App", None]:
    if environment_name is None:
        environment_name = config.get("environment")

    client = await _Client.from_env()

    async with _run_app(app, client=client, environment_name=environment_name):
        if _watcher is not None:
            watcher = _watcher  # Only used by tests
        else:
            mounts_to_watch = app._get_watch_mounts()
            watcher = watch(mounts_to_watch)
        async with TaskContext(grace=0.1) as tc:
            tc.create_task(
                _run_watch_loop(import_ref, app_id=app.app_id, watcher=watcher, environment_name=environment_name)
            )
            yield app


serve_app = synchronize_api(_serve_app)
