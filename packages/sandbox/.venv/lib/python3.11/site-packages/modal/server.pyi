import modal.app
import modal.client
import modal.functions
import modal.partial_function
import typing
import typing_extensions

class Server:
    """Server runs an HTTP server started in an `@modal.enter` method.

    See [lifecycle hooks](https://modal.com/docs/guide/lifecycle-functions) for more information.

    Generally, you will not construct a Server directly.
    Instead, use the [`@app._experimental_server()`](https://modal.com/docs/reference/modal.App#server) decorator.

    ```python notest
    @app._experimental_server(port=8000, proxy_regions=["us-east", "us-west"])
    class MyServer:
        @modal.enter()
        def start_server(self):
            self.process = subprocess.Popen(["python3", "-m", "http.server", "8080"])
    ```
    """

    _user_cls: typing.Optional[type]
    _service_function: modal.functions.Function
    _app: typing.Optional[modal.app.App]

    def __init__(self, /, *args, **kwargs):
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def _get_user_cls(self) -> type: ...
    def _get_app(self) -> modal.app.App: ...
    def _get_service_function(self) -> modal.functions.Function: ...
    @staticmethod
    def _extract_user_cls(wrapped_user_cls: typing.Union[type, modal.partial_function.PartialFunction]) -> type: ...

    class __get_urls_spec(typing_extensions.Protocol):
        def __call__(self, /) -> typing.Optional[dict[str, str]]: ...
        async def aio(self, /) -> typing.Optional[dict[str, str]]: ...

    get_urls: __get_urls_spec

    class __update_autoscaler_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            *,
            min_containers: typing.Optional[int] = None,
            max_containers: typing.Optional[int] = None,
            buffer_containers: typing.Optional[int] = None,
            scaledown_window: typing.Optional[int] = None,
        ) -> None:
            """Override the current autoscaler behavior for this Server.

            Unspecified parameters will retain their current value.

            Examples:
            ```python notest
            server = modal.Server.from_name("my-app", "Server")

            # Always have at least 2 containers running, with an extra buffer of 2 containers
            server.update_autoscaler(min_containers=2, buffer_containers=1)

            # Limit this Server to avoid spinning up more than 5 containers
            server.update_autoscaler(max_containers=5)
            ```
            """
            ...

        async def aio(
            self,
            /,
            *,
            min_containers: typing.Optional[int] = None,
            max_containers: typing.Optional[int] = None,
            buffer_containers: typing.Optional[int] = None,
            scaledown_window: typing.Optional[int] = None,
        ) -> None:
            """Override the current autoscaler behavior for this Server.

            Unspecified parameters will retain their current value.

            Examples:
            ```python notest
            server = modal.Server.from_name("my-app", "Server")

            # Always have at least 2 containers running, with an extra buffer of 2 containers
            server.update_autoscaler(min_containers=2, buffer_containers=1)

            # Limit this Server to avoid spinning up more than 5 containers
            server.update_autoscaler(max_containers=5)
            ```
            """
            ...

    update_autoscaler: __update_autoscaler_spec

    class __hydrate_spec(typing_extensions.Protocol):
        def __call__(self, /, client: typing.Optional[modal.client.Client] = None) -> Server: ...
        async def aio(self, /, client: typing.Optional[modal.client.Client] = None) -> Server: ...

    hydrate: __hydrate_spec

    @staticmethod
    def _from_local(
        wrapped_user_cls: typing.Union[type, modal.partial_function.PartialFunction],
        app: modal.app.App,
        service_function: modal.functions.Function,
    ) -> Server:
        """Create a Server from a local class definition."""
        ...

    @classmethod
    def from_name(
        cls: type[Server],
        app_name: str,
        name: str,
        *,
        environment_name: typing.Optional[str] = None,
        client: typing.Optional[modal.client.Client] = None,
    ) -> Server:
        """Reference a Server from a deployed App by its name.

        This is a lazy method that defers hydrating the local
        object with metadata from Modal servers until the first
        time it is actually used.

        ```python notest
        server = modal.Server.from_name("other-app", "Server")
        ```
        """
        ...

    def _is_local(self) -> bool:
        """Returns True if this Server has local source code available."""
        ...

    @staticmethod
    def _validate_wrapped_user_cls_decorators(
        wrapped_user_cls: typing.Union[type, modal.partial_function.PartialFunction], enable_memory_snapshot: bool
    ): ...
    @staticmethod
    def _validate_construction_mechanism(wrapped_user_cls: typing.Union[type, modal.partial_function.PartialFunction]):
        """Validate that the server class doesn't have a custom constructor."""
        ...
