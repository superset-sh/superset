# Copyright Modal Labs 2023
import asyncio
import inspect
import json
import os
from pathlib import Path
from typing import Any, Optional

import rich.panel
from rich.markdown import Markdown
from typer import Typer

from .._output import make_console
from ..exception import _CliUserExecutionError
from ..output import enable_output
from ..runner import run_app
from .import_refs import ImportRef, _get_runnable_app, import_file_or_module

launch_cli = Typer(
    name="launch",
    no_args_is_help=True,
    rich_markup_mode="markdown",
    help="""
    [Experimental] Open a serverless app instance on Modal.
    """,
)


def _launch_program(
    name: str, filename: str, detach: bool, args: dict[str, Any], *, description: Optional[str] = None
) -> None:
    console = make_console()
    console.print(
        rich.panel.Panel(
            Markdown(f"⚠️  `modal launch {name}` is **experimental** and may change in the future."),
            border_style="yellow",
        ),
    )

    os.environ["MODAL_LAUNCH_ARGS"] = json.dumps(args)

    program_path = str(Path(__file__).parent / "programs" / filename)
    base_cmd = f"modal launch {name}"
    module = import_file_or_module(ImportRef(program_path, use_module_mode=False), base_cmd=base_cmd)
    entrypoint = module.main

    app = _get_runnable_app(entrypoint)
    app.set_description(description if description else base_cmd)

    # `launch/` scripts must have a `local_entrypoint()` with no args, for simplicity here.
    func = entrypoint.info.raw_f
    isasync = inspect.iscoroutinefunction(func)
    with enable_output():
        with run_app(app, detach=detach):
            try:
                if isasync:
                    asyncio.run(func())
                else:
                    func()
            except Exception as exc:
                raise _CliUserExecutionError(inspect.getsourcefile(func)) from exc


@launch_cli.command(name="jupyter", help="Start Jupyter Lab on Modal.")
def jupyter(
    cpu: int = 8,
    memory: int = 32768,
    gpu: Optional[str] = None,
    timeout: int = 3600,
    image: str = "ubuntu:22.04",
    add_python: Optional[str] = "3.11",
    mount: Optional[str] = None,  # Adds a local directory to the jupyter container
    volume: Optional[str] = None,  # Attach a persisted `modal.Volume` by name (creating if missing).
    detach: bool = False,  # Run the app in "detached" mode to persist after local client disconnects
):
    console = make_console()
    console.print(
        rich.panel.Panel(
            (
                "[link=https://modal.com/notebooks]Try Modal Notebooks! "
                "modal.com/notebooks[/link]\n"
                "Notebooks have a new UI, saved content, real-time collaboration and more."
            ),
        ),
        style="bold cyan",
    )
    args = {
        "cpu": cpu,
        "memory": memory,
        "gpu": gpu,
        "timeout": timeout,
        "image": image,
        "add_python": add_python,
        "mount": mount,
        "volume": volume,
    }
    _launch_program("jupyter", "run_jupyter.py", detach, args)


@launch_cli.command(name="vscode", help="Start Visual Studio Code on Modal.")
def vscode(
    cpu: int = 8,
    memory: int = 32768,
    gpu: Optional[str] = None,
    image: str = "debian:12",
    timeout: int = 3600,
    mount: Optional[str] = None,  # Create a `modal.Mount` from a local directory.
    volume: Optional[str] = None,  # Attach a persisted `modal.Volume` by name (creating if missing).
    detach: bool = False,  # Run the app in "detached" mode to persist after local client disconnects
):
    args = {
        "cpu": cpu,
        "memory": memory,
        "gpu": gpu,
        "image": image,
        "timeout": timeout,
        "mount": mount,
        "volume": volume,
    }
    _launch_program("vscode", "vscode.py", detach, args)
