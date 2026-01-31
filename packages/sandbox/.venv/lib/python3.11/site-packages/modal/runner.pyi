import modal._load_context
import modal.app
import modal.client
import modal.running_app
import modal_proto.api_pb2
import multiprocessing.synchronize
import synchronicity.combined_types
import typing
import typing_extensions

V = typing.TypeVar("V")

async def _heartbeat(client: modal.client._Client, app_id: str) -> None: ...
async def _init_local_app_existing(
    client: modal.client._Client, existing_app_id: str, environment_name: str
) -> modal.running_app.RunningApp: ...
async def _init_local_app_new(
    client: modal.client._Client,
    description: str,
    tags: dict[str, str],
    app_state: int,
    environment_name: str = "",
    interactive: bool = False,
) -> modal.running_app.RunningApp: ...
async def _init_local_app_from_name(
    client: modal.client._Client, name: str, tags: dict[str, str], environment_name: str = ""
) -> modal.running_app.RunningApp: ...
async def _create_all_objects(
    running_app: modal.running_app.RunningApp,
    local_app_state: modal.app._LocalAppState,
    load_context: modal._load_context.LoadContext,
) -> None:
    """Create objects that have been defined but not created on the server.

    The load_context must have a task_context set for proper exception handling
    when loading shared dependencies.
    """
    ...

async def _publish_app(
    client: modal.client._Client,
    running_app: modal.running_app.RunningApp,
    app_state: int,
    app_local_state: modal.app._LocalAppState,
    name: str = "",
    deployment_tag: str = "",
    commit_info: typing.Optional[modal_proto.api_pb2.CommitInfo] = None,
) -> tuple[str, list[modal_proto.api_pb2.Warning]]:
    """Wrapper for AppPublish RPC."""
    ...

async def _disconnect(client: modal.client._Client, app_id: str, reason: int, exc_str: str = "") -> None:
    """Tell the server the client has disconnected for this app. Terminates all running tasks
    for ephemeral apps.
    """
    ...

async def _status_based_disconnect(
    client: modal.client._Client, app_id: str, exc_info: typing.Optional[BaseException] = None
):
    """Disconnect local session of a running app, sending relevant metadata

    exc_info: Exception if an exception caused the disconnect
    """
    ...

def _run_app(
    app: modal.app._App,
    *,
    client: typing.Optional[modal.client._Client] = None,
    detach: bool = False,
    environment_name: typing.Optional[str] = None,
    interactive: bool = False,
) -> typing.AsyncContextManager[modal.app._App]:
    """mdmd:hidden"""
    ...

async def _serve_update(
    app: modal.app._App, existing_app_id: str, is_ready: multiprocessing.synchronize.Event, environment_name: str
) -> None:
    """mdmd:hidden"""
    ...

class DeployResult:
    """Dataclass representing the result of deploying an app."""

    app_id: str
    app_page_url: str
    app_logs_url: str
    warnings: list[str]

    def __init__(self, app_id: str, app_page_url: str, app_logs_url: str, warnings: list[str]) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __repr__(self):
        """Return repr(self)."""
        ...

    def __eq__(self, other):
        """Return self==value."""
        ...

    def __setattr__(self, name, value):
        """Implement setattr(self, name, value)."""
        ...

    def __delattr__(self, name):
        """Implement delattr(self, name)."""
        ...

    def __hash__(self):
        """Return hash(self)."""
        ...

async def _deploy_app(
    app: modal.app._App,
    name: typing.Optional[str] = None,
    namespace: typing.Any = None,
    client: typing.Optional[modal.client._Client] = None,
    environment_name: typing.Optional[str] = None,
    tag: str = "",
) -> DeployResult:
    """Internal function for deploying an App.

    Users should prefer the `modal deploy` CLI or the `App.deploy` method.
    """
    ...

async def _interactive_shell(
    _app: modal.app._App, cmds: list[str], environment_name: str = "", pty: bool = True, **kwargs: typing.Any
) -> None:
    """Run an interactive shell (like `bash`) within the image for this app.

    This is useful for online debugging and interactive exploration of the
    contents of this image. If `cmd` is optionally provided, it will be run
    instead of the default shell inside this image.

    **Example**

    ```python
    import modal

    app = modal.App(image=modal.Image.debian_slim().apt_install("vim"))
    ```

    You can now run this using

    ```
    modal shell script.py --cmd /bin/bash
    ```

    When calling programmatically, `kwargs` are passed to `Sandbox.create()`.
    """
    ...

class __run_app_spec(typing_extensions.Protocol):
    def __call__(
        self,
        /,
        app: modal.app.App,
        *,
        client: typing.Optional[modal.client.Client] = None,
        detach: bool = False,
        environment_name: typing.Optional[str] = None,
        interactive: bool = False,
    ) -> synchronicity.combined_types.AsyncAndBlockingContextManager[modal.app.App]:
        """mdmd:hidden"""
        ...

    def aio(
        self,
        /,
        app: modal.app.App,
        *,
        client: typing.Optional[modal.client.Client] = None,
        detach: bool = False,
        environment_name: typing.Optional[str] = None,
        interactive: bool = False,
    ) -> typing.AsyncContextManager[modal.app.App]:
        """mdmd:hidden"""
        ...

run_app: __run_app_spec

class __serve_update_spec(typing_extensions.Protocol):
    def __call__(
        self,
        /,
        app: modal.app.App,
        existing_app_id: str,
        is_ready: multiprocessing.synchronize.Event,
        environment_name: str,
    ) -> None:
        """mdmd:hidden"""
        ...

    async def aio(
        self,
        /,
        app: modal.app.App,
        existing_app_id: str,
        is_ready: multiprocessing.synchronize.Event,
        environment_name: str,
    ) -> None:
        """mdmd:hidden"""
        ...

serve_update: __serve_update_spec

class __deploy_app_spec(typing_extensions.Protocol):
    def __call__(
        self,
        /,
        app: modal.app.App,
        name: typing.Optional[str] = None,
        namespace: typing.Any = None,
        client: typing.Optional[modal.client.Client] = None,
        environment_name: typing.Optional[str] = None,
        tag: str = "",
    ) -> DeployResult:
        """Internal function for deploying an App.

        Users should prefer the `modal deploy` CLI or the `App.deploy` method.
        """
        ...

    async def aio(
        self,
        /,
        app: modal.app.App,
        name: typing.Optional[str] = None,
        namespace: typing.Any = None,
        client: typing.Optional[modal.client.Client] = None,
        environment_name: typing.Optional[str] = None,
        tag: str = "",
    ) -> DeployResult:
        """Internal function for deploying an App.

        Users should prefer the `modal deploy` CLI or the `App.deploy` method.
        """
        ...

deploy_app: __deploy_app_spec

class __interactive_shell_spec(typing_extensions.Protocol):
    def __call__(
        self,
        /,
        _app: modal.app.App,
        cmds: list[str],
        environment_name: str = "",
        pty: bool = True,
        **kwargs: typing.Any,
    ) -> None:
        """Run an interactive shell (like `bash`) within the image for this app.

        This is useful for online debugging and interactive exploration of the
        contents of this image. If `cmd` is optionally provided, it will be run
        instead of the default shell inside this image.

        **Example**

        ```python
        import modal

        app = modal.App(image=modal.Image.debian_slim().apt_install("vim"))
        ```

        You can now run this using

        ```
        modal shell script.py --cmd /bin/bash
        ```

        When calling programmatically, `kwargs` are passed to `Sandbox.create()`.
        """
        ...

    async def aio(
        self,
        /,
        _app: modal.app.App,
        cmds: list[str],
        environment_name: str = "",
        pty: bool = True,
        **kwargs: typing.Any,
    ) -> None:
        """Run an interactive shell (like `bash`) within the image for this app.

        This is useful for online debugging and interactive exploration of the
        contents of this image. If `cmd` is optionally provided, it will be run
        instead of the default shell inside this image.

        **Example**

        ```python
        import modal

        app = modal.App(image=modal.Image.debian_slim().apt_install("vim"))
        ```

        You can now run this using

        ```
        modal shell script.py --cmd /bin/bash
        ```

        When calling programmatically, `kwargs` are passed to `Sandbox.create()`.
        """
        ...

interactive_shell: __interactive_shell_spec
