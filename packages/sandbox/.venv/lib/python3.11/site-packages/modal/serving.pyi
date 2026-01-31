import collections.abc
import modal.app
import modal.cli.import_refs
import multiprocessing.context
import multiprocessing.synchronize
import synchronicity.combined_types
import typing
import typing_extensions

def _run_serve(
    import_ref: modal.cli.import_refs.ImportRef,
    existing_app_id: str,
    is_ready: multiprocessing.synchronize.Event,
    environment_name: str,
    show_progress: bool,
): ...
async def _restart_serve(
    import_ref: modal.cli.import_refs.ImportRef, *, existing_app_id: str, environment_name: str, timeout: float = 5.0
) -> multiprocessing.context.SpawnProcess: ...
async def _terminate(proc: typing.Optional[multiprocessing.context.SpawnProcess], timeout: float = 5.0): ...
async def _run_watch_loop(
    import_ref: modal.cli.import_refs.ImportRef,
    *,
    app_id: str,
    watcher: collections.abc.AsyncGenerator[set[str], None],
    environment_name: str,
): ...
def _serve_app(
    app: modal.app._App,
    import_ref: modal.cli.import_refs.ImportRef,
    *,
    _watcher: typing.Optional[collections.abc.AsyncGenerator[set[str], None]] = None,
    environment_name: typing.Optional[str] = None,
) -> typing.AsyncContextManager[modal.app._App]: ...

class __serve_app_spec(typing_extensions.Protocol):
    def __call__(
        self,
        /,
        app: modal.app.App,
        import_ref: modal.cli.import_refs.ImportRef,
        *,
        _watcher: typing.Optional[typing.Generator[set[str], None, None]] = None,
        environment_name: typing.Optional[str] = None,
    ) -> synchronicity.combined_types.AsyncAndBlockingContextManager[modal.app.App]: ...
    def aio(
        self,
        /,
        app: modal.app.App,
        import_ref: modal.cli.import_refs.ImportRef,
        *,
        _watcher: typing.Optional[collections.abc.AsyncGenerator[set[str], None]] = None,
        environment_name: typing.Optional[str] = None,
    ) -> typing.AsyncContextManager[modal.app.App]: ...

serve_app: __serve_app_spec
