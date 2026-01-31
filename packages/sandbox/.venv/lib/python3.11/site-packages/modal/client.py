# Copyright Modal Labs 2022
import asyncio
import os
import platform
import sys
import urllib.parse
import warnings
from collections.abc import AsyncGenerator, Collection, Mapping
from typing import Any, ClassVar, Optional, TypeVar, Union

import grpclib.client
from google.protobuf import empty_pb2
from google.protobuf.message import Message
from synchronicity.async_wrap import asynccontextmanager

from modal._utils.async_utils import synchronizer
from modal_proto import api_pb2, modal_api_grpc
from modal_version import __version__

from ._traceback import print_server_warnings
from ._utils import async_utils
from ._utils.async_utils import TaskContext, synchronize_api
from ._utils.auth_token_manager import _AuthTokenManager
from ._utils.grpc_utils import ConnectionManager
from .config import _check_config, _is_remote, config, logger
from .exception import AuthError, ClientClosed

HEARTBEAT_INTERVAL: float = config.get("heartbeat_interval")
HEARTBEAT_TIMEOUT: float = HEARTBEAT_INTERVAL + 0.1


def _get_metadata(client_type: int, credentials: Optional[tuple[str, str]], version: str) -> dict[str, str]:
    # This implements a simplified version of platform.platform() that's still machine-readable
    uname: platform.uname_result = platform.uname()
    if uname.system == "Darwin":
        system, release = "macOS", platform.mac_ver()[0]
    else:
        system, release = uname.system, uname.release
    platform_str = "-".join(s.replace("-", "_") for s in (system, release, uname.machine))

    # sys.version_info is structured unlike sys.version or platform.python_version()
    python_version = "%d.%d.%d" % (sys.version_info.major, sys.version_info.minor, sys.version_info.micro)

    metadata = {
        "x-modal-client-version": version,
        "x-modal-client-type": str(client_type),
        "x-modal-python-version": python_version,
        "x-modal-node": urllib.parse.quote(platform.node()),
        "x-modal-platform": urllib.parse.quote(platform_str),
    }
    if credentials and client_type == api_pb2.CLIENT_TYPE_CLIENT:
        token_id, token_secret = credentials
        metadata.update(
            {
                "x-modal-token-id": token_id,
                "x-modal-token-secret": token_secret,
            }
        )
    return metadata


ReturnType = TypeVar("ReturnType")
_Value = Union[str, bytes]
_MetadataLike = Union[Mapping[str, _Value], Collection[tuple[str, _Value]]]
RequestType = TypeVar("RequestType", bound=Message)
ResponseType = TypeVar("ResponseType", bound=Message)


class _Client:
    _client_from_env: ClassVar[Optional["_Client"]] = None
    _client_from_env_lock: ClassVar[Optional[asyncio.Lock]] = None
    _cancellation_context: TaskContext
    _cancellation_context_event_loop: Optional[asyncio.AbstractEventLoop] = None
    _stub: Optional[modal_api_grpc.ModalClientModal] = None
    _auth_token_manager: Optional[_AuthTokenManager] = None
    _snapshotted: bool = False
    _connection_manager: Optional[ConnectionManager] = None
    client_type: "api_pb2.ClientType.ValueType"

    def __init__(
        self,
        server_url: str,
        client_type: "api_pb2.ClientType.ValueType",
        credentials: Optional[tuple[str, str]],
        version: str = __version__,
    ):
        """mdmd:hidden
        The Modal client object is not intended to be instantiated directly by users.
        """
        self.server_url = server_url
        self.client_type = client_type
        self._credentials = credentials
        self.version = version
        self._closed = False
        self._stub = None
        self._auth_token_manager = None
        self._snapshotted = False
        self._owner_pid = None

    def is_closed(self) -> bool:
        return self._closed

    @property
    def _is_localhost(self) -> bool:
        """Returns True if the server URL points to localhost."""
        hostname = urllib.parse.urlparse(self.server_url).hostname
        return hostname in {"localhost", "127.0.0.1", "::1", "172.21.0.1"}

    @property
    def stub(self) -> modal_api_grpc.ModalClientModal:
        """mdmd:hidden
        The default stub. Stubs can safely be used across forks / client snapshots.

        This is useful if you want to make requests to the default Modal server in us-east, for example
        control plane requests.

        This is equivalent to client.get_stub(default_server_url), but it's cached, so it's a bit faster.
        """
        assert self._stub
        return self._stub

    async def get_stub(self, server_url: str) -> modal_api_grpc.ModalClientModal:
        """mdmd:hidden
        Get a stub for a specific server URL. Stubs can safely be used across forks / client snapshots.

        This is useful if you want to make requests to a regional Modal server, for example low-latency
        function calls in us-west.

        This function is O(n) where n is the number of RPCs in ModalClient.
        """
        return await modal_api_grpc.ModalClientModal._create(self, server_url)

    async def _open(self):
        self._closed = False
        assert self._stub is None
        metadata = _get_metadata(self.client_type, self._credentials, self.version)
        self._cancellation_context = TaskContext(grace=0.5)  # allow running rpcs to finish in 0.5s when closing client
        self._cancellation_context_event_loop = asyncio.get_running_loop()
        await self._cancellation_context.__aenter__()
        self._connection_manager = ConnectionManager(client=self, metadata=metadata)
        self._stub = await self.get_stub(self.server_url)
        self._auth_token_manager = _AuthTokenManager(self.stub)
        self._owner_pid = os.getpid()

    async def _close(self, prep_for_restore: bool = False):
        logger.debug(f"Client ({id(self)}): closing")
        self._closed = True
        if hasattr(self, "_cancellation_context"):
            await self._cancellation_context.__aexit__(None, None, None)  # wait for all rpcs to be finished/cancelled
        if self._connection_manager:
            self._connection_manager.close()

        if prep_for_restore:
            self._snapshotted = True

        # Remove cached client.
        self.set_env_client(None)

    async def hello(self):
        """Connect to server and retrieve version information; raise appropriate error for various failures."""
        logger.debug(f"Client ({id(self)}): Starting")
        resp = await self.stub.ClientHello(empty_pb2.Empty())
        print_server_warnings(resp.server_warnings)

    async def __aenter__(self):
        await self._open()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self._close()

    @classmethod
    @asynccontextmanager
    async def anonymous(cls, server_url: str) -> AsyncGenerator["_Client", None]:
        """mdmd:hidden
        Create a connection with no credentials; to be used for token creation.
        """
        logger.debug("Client: Starting client without authentication")
        client = cls(server_url, api_pb2.CLIENT_TYPE_CLIENT, credentials=None)
        try:
            await client._open()
            yield client
        finally:
            await client._close()

    @classmethod
    async def from_env(cls, _override_config=None) -> "_Client":
        """mdmd:hidden
        Singleton that is instantiated from the Modal config and reused on subsequent calls.
        """
        _check_config()

        if _override_config:
            # Only used for testing
            c = _override_config
        else:
            c = config

        credentials: Optional[tuple[str, str]]

        if cls._client_from_env_lock is None:
            cls._client_from_env_lock = asyncio.Lock()

        async with cls._client_from_env_lock:
            if cls._client_from_env:
                return cls._client_from_env

            token_id = c["token_id"]
            token_secret = c["token_secret"]
            if _is_remote():
                if token_id or token_secret:
                    warnings.warn(
                        "Modal tokens provided by MODAL_TOKEN_ID and MODAL_TOKEN_SECRET"
                        " (or through the config file) are ignored inside containers."
                    )
                client_type = api_pb2.CLIENT_TYPE_CONTAINER
                credentials = None
            elif token_id and token_secret:
                client_type = api_pb2.CLIENT_TYPE_CLIENT
                credentials = (token_id, token_secret)
            else:
                raise AuthError(
                    "Token missing. Could not authenticate client."
                    " If you have token credentials, see modal.com/docs/reference/modal.config for setup help."
                    " If you are a new user, register an account at modal.com, then run `modal token new`."
                )

            server_url = c["server_url"]
            client = _Client(server_url, client_type, credentials)
            await client._open()
            async_utils.on_shutdown(client._close())
            cls._client_from_env = client
            return client

    @classmethod
    async def from_credentials(cls, token_id: str, token_secret: str) -> "_Client":
        """
        Constructor based on token credentials; useful for managing Modal on behalf of third-party users.

        **Usage:**

        ```python notest
        client = modal.Client.from_credentials("my_token_id", "my_token_secret")

        modal.Sandbox.create("echo", "hi", client=client, app=app)
        ```
        """
        _check_config()
        server_url = config["server_url"]
        client_type = api_pb2.CLIENT_TYPE_CLIENT
        credentials = (token_id, token_secret)
        client = _Client(server_url, client_type, credentials)
        await client._open()
        async_utils.on_shutdown(client._close())
        return client

    @classmethod
    async def verify(cls, server_url: str, credentials: tuple[str, str]) -> None:
        """mdmd:hidden
        Check whether can the client can connect to this server with these credentials; raise if not.
        """
        async with cls(server_url, api_pb2.CLIENT_TYPE_CLIENT, credentials) as client:
            await client.hello()  # Will call ClientHello RPC and possibly raise AuthError or ConnectionError

    @classmethod
    def set_env_client(cls, client: Optional["_Client"]):
        """mdmd:hidden"""
        # Just used from tests.
        cls._client_from_env = client

    async def get_input_plane_metadata(self, input_plane_region: str) -> list[tuple[str, str]]:
        assert self._auth_token_manager, "Client must have an instance of auth token manager."
        token = await self._auth_token_manager.get_token()
        return [
            ("x-modal-input-plane-region", input_plane_region),
            ("x-modal-auth-token", token),
        ]

    async def _call_safely(self, coro, readable_method: str):
        """Runs coroutine wrapped in a task that's part of the client's task context

        * Raises ClientClosed in case the client is closed while the coroutine is executed
        * Logs warning if call is made outside of the event loop that the client is running in,
          and execute without the cancellation context in that case
        """

        if self.is_closed():
            coro.close()  # prevent "was never awaited"
            raise ClientClosed(id(self))

        current_event_loop = asyncio.get_running_loop()
        if current_event_loop == self._cancellation_context_event_loop:
            # make request cancellable if we are in the same event loop as the rpc context
            # this should usually be the case!
            try:
                request_task = self._cancellation_context.create_task(coro)
                request_task.set_name(readable_method)
                return await request_task
            except asyncio.CancelledError:
                if self.is_closed():
                    raise ClientClosed(id(self)) from None
                raise  # if the task is cancelled as part of synchronizer shutdown or similar, don't raise ClientClosed
        else:
            # this should be rare - mostly used in tests where rpc requests sometimes are triggered
            # outside of a client context/synchronicity loop
            logger.warning(f"RPC request to {readable_method} made outside of task context")
            return await coro

    async def _reset_on_pid_change(self):
        if self._owner_pid and self._owner_pid != os.getpid():
            # not calling .close() since that would also interact with stale resources
            # just reset the internal state
            self._connection_manager = None
            self._stub = None
            self._owner_pid = None

            self.set_env_client(None)
            # TODO(elias): reset _cancellation_context in case ?
            await self._open()

    async def _get_channel(self, server_url: str) -> grpclib.client.Channel:
        # Get a valid grpclib channel, reusing existing channels if possible.
        # This prevents usage of stale channels across forks of processes.
        await self._reset_on_pid_change()
        assert self._connection_manager  # invariant: ._open() should always have been called before this
        return await self._connection_manager.get_or_create_channel(server_url)

    @synchronizer.nowrap
    async def _call_unary(
        self,
        grpclib_method: grpclib.client.UnaryUnaryMethod[RequestType, ResponseType],
        request: Any,
        *,
        timeout: Optional[float] = None,
        metadata: Optional[_MetadataLike] = None,
    ) -> Any:
        coro = grpclib_method(request, timeout=timeout, metadata=metadata)
        return await self._call_safely(coro, grpclib_method.name)

    @synchronizer.nowrap
    async def _call_stream(
        self,
        grpclib_method: grpclib.client.UnaryStreamMethod[RequestType, ResponseType],
        request: Any,
        *,
        metadata: Optional[_MetadataLike],
    ) -> AsyncGenerator[Any, None]:
        stream_context = grpclib_method.open(metadata=metadata)
        stream = await self._call_safely(stream_context.__aenter__(), f"{grpclib_method.name}.open")
        try:
            await self._call_safely(stream.send_message(request, end=True), f"{grpclib_method.name}.send_message")
            while 1:
                try:
                    yield await self._call_safely(stream.__anext__(), f"{grpclib_method.name}.recv")
                except StopAsyncIteration:
                    break
        except BaseException as exc:
            did_handle_exception = await stream_context.__aexit__(type(exc), exc, exc.__traceback__)
            if not did_handle_exception:
                raise
        else:
            await stream_context.__aexit__(None, None, None)


Client = synchronize_api(_Client)
