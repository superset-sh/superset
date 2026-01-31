# Copyright Modal Labs 2025
import inspect
import typing
from typing import Optional

from ._functions import _Function
from ._load_context import LoadContext
from ._object import live_method
from ._partial_function import (
    _find_partial_methods_for_user_cls,
    _PartialFunction,
    _PartialFunctionFlags,
)
from .client import _Client
from .cls import is_parameter
from .exception import InvalidError

if typing.TYPE_CHECKING:
    import modal.app


def validate_http_server_config(
    port: int,
    proxy_regions: list[str],  # The regions to proxy the HTTP server to.
    startup_timeout: int,  # Maximum number of seconds to wait for the HTTP server to start.
    exit_grace_period: Optional[int],  # The time to wait for the HTTP server to exit gracefully.
):
    if not isinstance(port, int) or port < 1 or port > 65535:
        raise InvalidError("Port must be a positive integer between 1 and 65535.")
    if startup_timeout <= 0:
        raise InvalidError("The `startup_timeout` argument must be positive.")
    if exit_grace_period is not None and exit_grace_period < 0:
        raise InvalidError("The `exit_grace_period` argument must be non-negative.")
    if not proxy_regions:
        raise InvalidError("The `proxy_regions` argument must be non-empty.")


class _Server:
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

    _user_cls: Optional[type] = None  # None if remote
    _service_function: _Function
    _app: Optional["modal.app._App"] = None  # None if remote

    def _get_user_cls(self) -> type:
        assert self._user_cls is not None
        return self._user_cls

    def _get_app(self) -> "modal.app._App":
        assert self._app
        return self._app

    def _get_service_function(self) -> _Function:
        return self._service_function

    @staticmethod
    def _extract_user_cls(wrapped_user_cls: "type | _PartialFunction") -> type:
        if isinstance(wrapped_user_cls, _PartialFunction):
            assert wrapped_user_cls.user_cls
            return wrapped_user_cls.user_cls
        else:
            return wrapped_user_cls

    # ============ Live Methods ============

    @live_method
    async def get_urls(self) -> Optional[dict[str, str]]:
        def _extract_region_from_url(url: str) -> str:
            return url.split(".")[-3].removeprefix("modal-")

        return {
            _extract_region_from_url(url): url
            for url in await self._get_service_function()._experimental_get_flash_urls() or []
        }

    @live_method
    async def update_autoscaler(
        self,
        *,
        min_containers: Optional[int] = None,
        max_containers: Optional[int] = None,
        buffer_containers: Optional[int] = None,
        scaledown_window: Optional[int] = None,
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
        return await self._get_service_function().update_autoscaler(
            min_containers=min_containers,
            max_containers=max_containers,
            scaledown_window=scaledown_window,
            buffer_containers=buffer_containers,
        )

    # ============ Hydration ============
    async def hydrate(self, client: Optional[_Client] = None) -> "_Server":
        # This is required since we want to support @livemethod() decorated methods
        service_function = self._get_service_function()
        await service_function.hydrate(client)
        return self

    # ============ Construction ============
    @staticmethod
    def _from_local(
        wrapped_user_cls: "type | _PartialFunction",
        app: "modal.app._App",
        service_function: _Function,
    ) -> "_Server":
        """Create a Server from a local class definition."""

        # Note: Validation should be done by the caller (app._experimental_server()) BEFORE creating the Server.
        # Extract the underlying class if wrapped in a _PartialFunction (e.g., from @modal.clustered())
        user_cls = _Server._extract_user_cls(wrapped_user_cls)

        server = _Server()
        server._app = app
        server._user_cls = user_cls
        server._service_function = service_function
        return server

    @classmethod
    def from_name(
        cls: type["_Server"],
        app_name: str,
        name: str,
        *,
        environment_name: Optional[str] = None,
        client: Optional[_Client] = None,
    ) -> "_Server":
        """Reference a Server from a deployed App by its name.

        This is a lazy method that defers hydrating the local
        object with metadata from Modal servers until the first
        time it is actually used.

        ```python notest
        server = modal.Server.from_name("other-app", "Server")
        ```
        """

        load_context_overrides = LoadContext(client=client, environment_name=environment_name)

        server = _Server()
        server._service_function = _Function._from_name(
            app_name,
            name,
            load_context_overrides=load_context_overrides,
        )
        return server

    def _is_local(self) -> bool:
        """Returns True if this Server has local source code available."""
        return self._user_cls is not None

    # ============ Validation ============

    @staticmethod
    def _validate_wrapped_user_cls_decorators(
        wrapped_user_cls: "type | _PartialFunction", enable_memory_snapshot: bool
    ):
        user_cls = _Server._extract_user_cls(wrapped_user_cls)

        if not inspect.isclass(user_cls):
            raise TypeError("The @app._experimental_server() decorator must be used on a class.")

        # Check for modal.parameter() - not allowed on server classes
        params = {k: v for k, v in user_cls.__dict__.items() if is_parameter(v)}
        if params:
            raise InvalidError(
                f"Server class {user_cls.__name__} cannot use modal.parameter(). "
                "Servers do not support parameterization."
            )

        if not _find_partial_methods_for_user_cls(
            user_cls, _PartialFunctionFlags.ENTER_PRE_SNAPSHOT
        ) and not _find_partial_methods_for_user_cls(user_cls, _PartialFunctionFlags.ENTER_POST_SNAPSHOT):
            raise InvalidError("Server class must have an @modal.enter() to setup the server.")

        # Check for disallowed decorators
        # @modal.method() not allowed
        if _find_partial_methods_for_user_cls(user_cls, _PartialFunctionFlags.CALLABLE_INTERFACE).values():
            raise InvalidError(
                f"Server class {user_cls.__name__} cannot have `@modal.method()` decorated functions. "
                "Servers only expose HTTP endpoints."
            )
        # @enter with snap=True without enable_memory_snapshot
        if (
            _find_partial_methods_for_user_cls(user_cls, _PartialFunctionFlags.ENTER_PRE_SNAPSHOT)
            and not enable_memory_snapshot
        ):
            raise InvalidError(
                "Server must have `enable_memory_snapshot=True` to use `snap=True` on `@modal.enter` methods."
            )

        if isinstance(wrapped_user_cls, _PartialFunction):
            # @modal.concurrent not allowed on server classes
            if wrapped_user_cls.flags & _PartialFunctionFlags.CONCURRENT:
                raise InvalidError(
                    f"Server class {user_cls.__name__} cannot be decorated with `@modal.concurrent()`. "
                    "Please use `target_concurrency` param instead."
                )
            # @modal.http_server not allowed on server classes
            if wrapped_user_cls.flags & _PartialFunctionFlags.HTTP_WEB_INTERFACE:
                raise InvalidError(
                    f"Server class {user_cls.__name__} cannot have @modal.experimental.http_server() decorator. "
                    "Servers already expose HTTP endpoints."
                )
            # @modal.web_server not allowed on server classes
            if wrapped_user_cls.flags & _PartialFunctionFlags.WEB_INTERFACE:
                raise InvalidError(
                    f"Server class {user_cls.__name__} cannot be decorated with `@modal.web_server()`. "
                    "Servers already expose HTTP endpoints."
                )

    @staticmethod
    def _validate_construction_mechanism(wrapped_user_cls: "type | _PartialFunction"):
        """Validate that the server class doesn't have a custom constructor."""
        # Extract the underlying class if wrapped in a _PartialFunction (e.g., from @modal.clustered())
        user_cls = _Server._extract_user_cls(wrapped_user_cls)

        if user_cls.__init__ != object.__init__:  # type: ignore
            raise InvalidError(
                f"Server class {user_cls.__name__} cannot have a custom __init__ method. "
                "Use @modal.enter() for initialization logic instead."
            )
