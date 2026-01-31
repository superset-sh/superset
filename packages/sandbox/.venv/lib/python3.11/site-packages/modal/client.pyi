import asyncio.events
import asyncio.locks
import collections.abc
import google.protobuf.message
import grpclib.client
import modal._utils.async_utils
import modal._utils.auth_token_manager
import modal._utils.grpc_utils
import modal_proto.modal_api_grpc
import synchronicity.combined_types
import typing
import typing_extensions

def _get_metadata(client_type: int, credentials: typing.Optional[tuple[str, str]], version: str) -> dict[str, str]: ...

ReturnType = typing.TypeVar("ReturnType")

RequestType = typing.TypeVar("RequestType", bound="google.protobuf.message.Message")

ResponseType = typing.TypeVar("ResponseType", bound="google.protobuf.message.Message")

class _Client:
    _client_from_env: typing.ClassVar[typing.Optional[_Client]]
    _client_from_env_lock: typing.ClassVar[typing.Optional[asyncio.locks.Lock]]
    _cancellation_context: modal._utils.async_utils.TaskContext
    _cancellation_context_event_loop: typing.Optional[asyncio.events.AbstractEventLoop]
    _stub: typing.Optional[modal_proto.modal_api_grpc.ModalClientModal]
    _auth_token_manager: typing.Optional[modal._utils.auth_token_manager._AuthTokenManager]
    _snapshotted: bool
    _connection_manager: typing.Optional[modal._utils.grpc_utils.ConnectionManager]
    client_type: int

    def __init__(
        self, server_url: str, client_type: int, credentials: typing.Optional[tuple[str, str]], version: str = "1.3.2"
    ):
        """mdmd:hidden
        The Modal client object is not intended to be instantiated directly by users.
        """
        ...

    def is_closed(self) -> bool: ...
    @property
    def _is_localhost(self) -> bool:
        """Returns True if the server URL points to localhost."""
        ...

    @property
    def stub(self) -> modal_proto.modal_api_grpc.ModalClientModal:
        """mdmd:hidden
        The default stub. Stubs can safely be used across forks / client snapshots.

        This is useful if you want to make requests to the default Modal server in us-east, for example
        control plane requests.

        This is equivalent to client.get_stub(default_server_url), but it's cached, so it's a bit faster.
        """
        ...

    async def get_stub(self, server_url: str) -> modal_proto.modal_api_grpc.ModalClientModal:
        """mdmd:hidden
        Get a stub for a specific server URL. Stubs can safely be used across forks / client snapshots.

        This is useful if you want to make requests to a regional Modal server, for example low-latency
        function calls in us-west.

        This function is O(n) where n is the number of RPCs in ModalClient.
        """
        ...

    async def _open(self): ...
    async def _close(self, prep_for_restore: bool = False): ...
    async def hello(self):
        """Connect to server and retrieve version information; raise appropriate error for various failures."""
        ...

    async def __aenter__(self): ...
    async def __aexit__(self, exc_type, exc, tb): ...
    @classmethod
    def anonymous(cls, server_url: str) -> typing.AsyncContextManager[_Client]:
        """mdmd:hidden
        Create a connection with no credentials; to be used for token creation.
        """
        ...

    @classmethod
    async def from_env(cls, _override_config=None) -> _Client:
        """mdmd:hidden
        Singleton that is instantiated from the Modal config and reused on subsequent calls.
        """
        ...

    @classmethod
    async def from_credentials(cls, token_id: str, token_secret: str) -> _Client:
        """Constructor based on token credentials; useful for managing Modal on behalf of third-party users.

        **Usage:**

        ```python notest
        client = modal.Client.from_credentials("my_token_id", "my_token_secret")

        modal.Sandbox.create("echo", "hi", client=client, app=app)
        ```
        """
        ...

    @classmethod
    async def verify(cls, server_url: str, credentials: tuple[str, str]) -> None:
        """mdmd:hidden
        Check whether can the client can connect to this server with these credentials; raise if not.
        """
        ...

    @classmethod
    def set_env_client(cls, client: typing.Optional[_Client]):
        """mdmd:hidden"""
        ...

    async def get_input_plane_metadata(self, input_plane_region: str) -> list[tuple[str, str]]: ...
    async def _call_safely(self, coro, readable_method: str):
        """Runs coroutine wrapped in a task that's part of the client's task context

        * Raises ClientClosed in case the client is closed while the coroutine is executed
        * Logs warning if call is made outside of the event loop that the client is running in,
          and execute without the cancellation context in that case
        """
        ...

    async def _reset_on_pid_change(self): ...
    async def _get_channel(self, server_url: str) -> grpclib.client.Channel: ...
    async def _call_unary(
        self,
        grpclib_method: grpclib.client.UnaryUnaryMethod[RequestType, ResponseType],
        request: typing.Any,
        *,
        timeout: typing.Optional[float] = None,
        metadata: typing.Union[
            collections.abc.Mapping[str, typing.Union[str, bytes]],
            collections.abc.Collection[tuple[str, typing.Union[str, bytes]]],
            None,
        ] = None,
    ) -> typing.Any: ...
    def _call_stream(
        self,
        grpclib_method: grpclib.client.UnaryStreamMethod[RequestType, ResponseType],
        request: typing.Any,
        *,
        metadata: typing.Union[
            collections.abc.Mapping[str, typing.Union[str, bytes]],
            collections.abc.Collection[tuple[str, typing.Union[str, bytes]]],
            None,
        ],
    ) -> collections.abc.AsyncGenerator[typing.Any, None]: ...

class Client:
    _client_from_env: typing.ClassVar[typing.Optional[Client]]
    _client_from_env_lock: typing.ClassVar[typing.Optional[asyncio.locks.Lock]]
    _cancellation_context: modal._utils.async_utils.TaskContext
    _cancellation_context_event_loop: typing.Optional[asyncio.events.AbstractEventLoop]
    _stub: typing.Optional[modal_proto.modal_api_grpc.ModalClientModal]
    _auth_token_manager: typing.Optional[modal._utils.auth_token_manager._AuthTokenManager]
    _snapshotted: bool
    _connection_manager: typing.Optional[modal._utils.grpc_utils.ConnectionManager]
    client_type: int

    def __init__(
        self, server_url: str, client_type: int, credentials: typing.Optional[tuple[str, str]], version: str = "1.3.2"
    ):
        """mdmd:hidden
        The Modal client object is not intended to be instantiated directly by users.
        """
        ...

    def is_closed(self) -> bool: ...
    @property
    def _is_localhost(self) -> bool:
        """Returns True if the server URL points to localhost."""
        ...

    @property
    def stub(self) -> modal_proto.modal_api_grpc.ModalClientModal:
        """mdmd:hidden
        The default stub. Stubs can safely be used across forks / client snapshots.

        This is useful if you want to make requests to the default Modal server in us-east, for example
        control plane requests.

        This is equivalent to client.get_stub(default_server_url), but it's cached, so it's a bit faster.
        """
        ...

    class __get_stub_spec(typing_extensions.Protocol):
        def __call__(self, /, server_url: str) -> modal_proto.modal_api_grpc.ModalClientModal:
            """mdmd:hidden
            Get a stub for a specific server URL. Stubs can safely be used across forks / client snapshots.

            This is useful if you want to make requests to a regional Modal server, for example low-latency
            function calls in us-west.

            This function is O(n) where n is the number of RPCs in ModalClient.
            """
            ...

        async def aio(self, /, server_url: str) -> modal_proto.modal_api_grpc.ModalClientModal:
            """mdmd:hidden
            Get a stub for a specific server URL. Stubs can safely be used across forks / client snapshots.

            This is useful if you want to make requests to a regional Modal server, for example low-latency
            function calls in us-west.

            This function is O(n) where n is the number of RPCs in ModalClient.
            """
            ...

    get_stub: __get_stub_spec

    class ___open_spec(typing_extensions.Protocol):
        def __call__(self, /): ...
        async def aio(self, /): ...

    _open: ___open_spec

    class ___close_spec(typing_extensions.Protocol):
        def __call__(self, /, prep_for_restore: bool = False): ...
        async def aio(self, /, prep_for_restore: bool = False): ...

    _close: ___close_spec

    class __hello_spec(typing_extensions.Protocol):
        def __call__(self, /):
            """Connect to server and retrieve version information; raise appropriate error for various failures."""
            ...

        async def aio(self, /):
            """Connect to server and retrieve version information; raise appropriate error for various failures."""
            ...

    hello: __hello_spec

    def __enter__(self): ...
    async def __aenter__(self): ...
    def __exit__(self, exc_type, exc, tb): ...
    async def __aexit__(self, exc_type, exc, tb): ...

    class __anonymous_spec(typing_extensions.Protocol):
        def __call__(self, /, server_url: str) -> synchronicity.combined_types.AsyncAndBlockingContextManager[Client]:
            """mdmd:hidden
            Create a connection with no credentials; to be used for token creation.
            """
            ...

        def aio(self, /, server_url: str) -> typing.AsyncContextManager[Client]:
            """mdmd:hidden
            Create a connection with no credentials; to be used for token creation.
            """
            ...

    anonymous: typing.ClassVar[__anonymous_spec]

    class __from_env_spec(typing_extensions.Protocol):
        def __call__(self, /, _override_config=None) -> Client:
            """mdmd:hidden
            Singleton that is instantiated from the Modal config and reused on subsequent calls.
            """
            ...

        async def aio(self, /, _override_config=None) -> Client:
            """mdmd:hidden
            Singleton that is instantiated from the Modal config and reused on subsequent calls.
            """
            ...

    from_env: typing.ClassVar[__from_env_spec]

    class __from_credentials_spec(typing_extensions.Protocol):
        def __call__(self, /, token_id: str, token_secret: str) -> Client:
            """Constructor based on token credentials; useful for managing Modal on behalf of third-party users.

            **Usage:**

            ```python notest
            client = modal.Client.from_credentials("my_token_id", "my_token_secret")

            modal.Sandbox.create("echo", "hi", client=client, app=app)
            ```
            """
            ...

        async def aio(self, /, token_id: str, token_secret: str) -> Client:
            """Constructor based on token credentials; useful for managing Modal on behalf of third-party users.

            **Usage:**

            ```python notest
            client = modal.Client.from_credentials("my_token_id", "my_token_secret")

            modal.Sandbox.create("echo", "hi", client=client, app=app)
            ```
            """
            ...

    from_credentials: typing.ClassVar[__from_credentials_spec]

    class __verify_spec(typing_extensions.Protocol):
        def __call__(self, /, server_url: str, credentials: tuple[str, str]) -> None:
            """mdmd:hidden
            Check whether can the client can connect to this server with these credentials; raise if not.
            """
            ...

        async def aio(self, /, server_url: str, credentials: tuple[str, str]) -> None:
            """mdmd:hidden
            Check whether can the client can connect to this server with these credentials; raise if not.
            """
            ...

    verify: typing.ClassVar[__verify_spec]

    @classmethod
    def set_env_client(cls, client: typing.Optional[Client]):
        """mdmd:hidden"""
        ...

    class __get_input_plane_metadata_spec(typing_extensions.Protocol):
        def __call__(self, /, input_plane_region: str) -> list[tuple[str, str]]: ...
        async def aio(self, /, input_plane_region: str) -> list[tuple[str, str]]: ...

    get_input_plane_metadata: __get_input_plane_metadata_spec

    class ___call_safely_spec(typing_extensions.Protocol):
        def __call__(self, /, coro, readable_method: str):
            """Runs coroutine wrapped in a task that's part of the client's task context

            * Raises ClientClosed in case the client is closed while the coroutine is executed
            * Logs warning if call is made outside of the event loop that the client is running in,
              and execute without the cancellation context in that case
            """
            ...

        async def aio(self, /, coro, readable_method: str):
            """Runs coroutine wrapped in a task that's part of the client's task context

            * Raises ClientClosed in case the client is closed while the coroutine is executed
            * Logs warning if call is made outside of the event loop that the client is running in,
              and execute without the cancellation context in that case
            """
            ...

    _call_safely: ___call_safely_spec

    class ___reset_on_pid_change_spec(typing_extensions.Protocol):
        def __call__(self, /): ...
        async def aio(self, /): ...

    _reset_on_pid_change: ___reset_on_pid_change_spec

    class ___get_channel_spec(typing_extensions.Protocol):
        def __call__(self, /, server_url: str) -> grpclib.client.Channel: ...
        async def aio(self, /, server_url: str) -> grpclib.client.Channel: ...

    _get_channel: ___get_channel_spec

    async def _call_unary(
        self,
        grpclib_method: grpclib.client.UnaryUnaryMethod[RequestType, ResponseType],
        request: typing.Any,
        *,
        timeout: typing.Optional[float] = None,
        metadata: typing.Union[
            collections.abc.Mapping[str, typing.Union[str, bytes]],
            collections.abc.Collection[tuple[str, typing.Union[str, bytes]]],
            None,
        ] = None,
    ) -> typing.Any: ...
    def _call_stream(
        self,
        grpclib_method: grpclib.client.UnaryStreamMethod[RequestType, ResponseType],
        request: typing.Any,
        *,
        metadata: typing.Union[
            collections.abc.Mapping[str, typing.Union[str, bytes]],
            collections.abc.Collection[tuple[str, typing.Union[str, bytes]]],
            None,
        ],
    ) -> collections.abc.AsyncGenerator[typing.Any, None]: ...

HEARTBEAT_INTERVAL: float

HEARTBEAT_TIMEOUT: float
