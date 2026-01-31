import asyncio

from types import TracebackType
from typing import TYPE_CHECKING, Collection, Optional, Type

from .client import Channel
from .server import Server
from .protocol import H2Protocol
from .encoding.base import CodecBase, StatusDetailsCodecBase

if TYPE_CHECKING:
    from ._typing import IServable  # noqa


class _Server(asyncio.AbstractServer):

    def get_loop(self) -> asyncio.AbstractEventLoop:
        raise NotImplementedError

    def is_serving(self) -> bool:
        raise NotImplementedError

    async def start_serving(self) -> None:
        raise NotImplementedError

    async def serve_forever(self) -> None:
        raise NotImplementedError

    def close(self) -> None:
        pass

    async def wait_closed(self) -> None:
        pass


class _InMemoryTransport(asyncio.Transport):

    def __init__(
        self,
        protocol: H2Protocol,
    ) -> None:
        super().__init__()
        self._loop = asyncio.get_event_loop()
        self._protocol = protocol

    def _write_soon(self, data: bytes) -> None:
        if not self._protocol.connection.is_closing():
            self._protocol.data_received(data)

    def write(self, data: bytes) -> None:
        if data:
            self._loop.call_soon(self._write_soon, data)

    def is_closing(self) -> bool:
        return False

    def close(self) -> None:
        pass


class ChannelFor:
    """Manages specially initialised :py:class:`~grpclib.client.Channel`
    with an in-memory transport to a :py:class:`~grpclib.server.Server`

    Example:

    .. code-block:: python3

        class Greeter(GreeterBase):
            ...

        greeter = Greeter()

        async with ChannelFor([greeter]) as channel:
            stub = GreeterStub(channel)
            response = await stub.SayHello(HelloRequest(name='Dr. Strange'))
            assert response.message == 'Hello, Dr. Strange!'
    """
    def __init__(
        self,
        services: Collection['IServable'],
        codec: Optional[CodecBase] = None,
        status_details_codec: Optional[StatusDetailsCodecBase] = None,
    ) -> None:
        """
        :param services: list of services you want to test

        :param codec: instance of a codec to encode and decode messages,
            if omitted ``ProtoCodec`` is used by default

        :param status_details_codec: instance of a status details codec to
            encode and decode error details in a trailing metadata, if omitted
            ``ProtoStatusDetailsCodec`` is used by default
        """
        self._services = services
        self._codec = codec
        self._status_details_codec = status_details_codec

    async def __aenter__(self) -> Channel:
        """
        :return: :py:class:`~grpclib.client.Channel`
        """
        self._server = Server(
            self._services,
            codec=self._codec,
            status_details_codec=self._status_details_codec,
        )
        self._server._server = _Server()
        self._server._server_closed_fut = self._server._loop.create_future()
        self._server_protocol = self._server._protocol_factory()

        self._channel = Channel(
            codec=self._codec,
            status_details_codec=self._status_details_codec,
        )
        self._channel._protocol = self._channel._protocol_factory()

        self._channel._protocol.connection_made(
            _InMemoryTransport(self._server_protocol)
        )
        self._server_protocol.connection_made(
            _InMemoryTransport(self._channel._protocol)
        )
        return self._channel

    async def __aexit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> None:
        assert self._channel._protocol is not None
        self._channel._protocol.connection_lost(None)
        self._channel.close()

        self._server_protocol.connection_lost(None)
        self._server.close()
        await self._server.wait_closed()
