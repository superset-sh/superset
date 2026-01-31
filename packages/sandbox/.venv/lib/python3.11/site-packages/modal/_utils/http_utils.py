# Copyright Modal Labs 2022
import contextlib
from typing import TYPE_CHECKING, Optional

# Note: importing aiohttp seems to take about 100ms, and it's not really necessarily,
# unless we need to work with blobs. So that's why we import it lazily instead.

if TYPE_CHECKING:
    from aiohttp import ClientSession
    from aiohttp.web import Application

from .async_utils import on_shutdown


def _http_client_with_tls(timeout: Optional[float]) -> "ClientSession":
    """Create a new HTTP client session with standard, bundled TLS certificates.

    This is necessary to prevent client issues on some system where Python does
    not come pre-installed with specific TLS certificates that are necessary to
    connect to AWS S3 bucket URLs.

    Specifically: the error "unable to get local issuer certificate" when making
    an aiohttp request.
    """
    import ssl

    import certifi
    from aiohttp import ClientSession, ClientTimeout, TCPConnector

    ssl_context = ssl.create_default_context(cafile=certifi.where())
    connector = TCPConnector(ssl=ssl_context)
    return ClientSession(connector=connector, timeout=ClientTimeout(total=timeout))


class ClientSessionRegistry:
    _client_session: "ClientSession"
    _client_session_active: bool = False

    @staticmethod
    def get_session():
        if not ClientSessionRegistry._client_session_active:
            ClientSessionRegistry._client_session = _http_client_with_tls(timeout=None)
            ClientSessionRegistry._client_session_active = True
            on_shutdown(ClientSessionRegistry.close_session())
        return ClientSessionRegistry._client_session

    @staticmethod
    async def close_session():
        if ClientSessionRegistry._client_session_active:
            await ClientSessionRegistry._client_session.close()
            ClientSessionRegistry._client_session_active = False


@contextlib.asynccontextmanager
async def run_temporary_http_server(app: "Application"):
    # Allocates a random port, runs a server in a context manager
    # This is used in various tests
    import socket

    from aiohttp.web_runner import AppRunner, SockSite

    sock = socket.socket()
    sock.bind(("", 0))
    port = sock.getsockname()[1]
    host = f"http://127.0.0.1:{port}"

    runner = AppRunner(app)
    await runner.setup()
    site = SockSite(runner, sock=sock)
    await site.start()
    try:
        yield host
    finally:
        await runner.cleanup()
