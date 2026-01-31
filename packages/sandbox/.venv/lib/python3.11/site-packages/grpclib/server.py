import abc
import time
import socket
import logging
import asyncio
import warnings

from types import TracebackType
from typing import TYPE_CHECKING, Optional, Collection, Generic, Type, cast
from typing import List, Tuple, Dict, Any, Callable, ContextManager, Set
from contextlib import nullcontext

import h2.config
import h2.exceptions

from multidict import MultiDict

from .utils import DeadlineWrapper, Wrapper
from .const import Status, Cardinality
from .config import Configuration
from .stream import send_message, recv_message, StreamIterator
from .stream import _RecvType, _SendType
from .events import _DispatchServerEvents
from .metadata import Deadline, encode_grpc_message, _Metadata
from .metadata import encode_metadata, decode_metadata, _MetadataLike
from .metadata import _STATUS_DETAILS_KEY, encode_bin_value
from .protocol import H2Protocol, AbstractHandler
from .exceptions import GRPCError, ProtocolError, StreamTerminatedError
from .encoding.base import GRPC_CONTENT_TYPE, CodecBase, StatusDetailsCodecBase
from .encoding.proto import ProtoCodec, ProtoStatusDetailsCodec
from .encoding.proto import _googleapis_available

from ._registry import servers as _servers

if TYPE_CHECKING:
    import ssl as _ssl  # noqa
    from . import const  # noqa
    from . import protocol  # noqa
    from ._typing import IServable  # noqa


log = logging.getLogger(__name__)

_Headers = List[Tuple[str, str]]


class Stream(StreamIterator[_RecvType], Generic[_RecvType, _SendType]):
    """
    Represents gRPC method call – HTTP/2 request/stream, and everything you
    need to communicate with client in order to handle this request.

    As you can see, every method handler accepts single positional argument -
    stream:

    .. code-block:: python3

        async def MakeLatte(self, stream: grpclib.server.Stream):
            task: cafe_pb2.LatteOrder = await stream.recv_message()
            ...
            await stream.send_message(empty_pb2.Empty())

    This is true for every gRPC method type.
    """
    # state
    _send_initial_metadata_done = False
    _send_message_done = False
    _send_trailing_metadata_done = False
    _cancel_done = False

    # stats
    _messages_sent = 0
    _messages_received = 0

    def __init__(
        self,
        stream: 'protocol.Stream',
        method_name: str,
        cardinality: Cardinality,
        recv_type: Type[_RecvType],
        send_type: Type[_SendType],
        *,
        codec: CodecBase,
        status_details_codec: Optional[StatusDetailsCodecBase],
        dispatch: _DispatchServerEvents,
        deadline: Optional[Deadline] = None,
        user_agent: Optional[str] = None,
    ):
        self._stream = stream
        self._method_name = method_name
        self._cardinality = cardinality
        self._recv_type = recv_type
        self._send_type = send_type
        self._codec = codec
        self._status_details_codec = status_details_codec
        self._dispatch = dispatch
        #: :py:class:`~grpclib.metadata.Deadline` of the current request
        self.deadline = deadline
        #: Invocation metadata, received with headers from the client.
        #: Represented as a multi-dict object.
        self.metadata: Optional[_Metadata] = None
        #: Client's user-agent
        self.user_agent = user_agent
        #: Connection's peer info of type :py:class:`~grpclib.protocol.Peer`
        self.peer = self._stream.connection.get_peer()

    @property
    def _content_type(self) -> str:
        return GRPC_CONTENT_TYPE + '+' + self._codec.__content_subtype__

    async def recv_message(self) -> Optional[_RecvType]:
        """Coroutine to receive incoming message from the client.

        If client sends UNARY request, then you can call this coroutine
        only once. If client sends STREAM request, then you should call this
        coroutine several times, until it returns None when the client has
        ended the stream. To simplify your code in this case,
        :py:class:`Stream` class implements async iteration protocol, so
        you can use it like this:

        .. code-block:: python3

            async for message in stream:
                do_smth_with(message)

        or even like this:

        .. code-block:: python3

            messages = [msg async for msg in stream]

        HTTP/2 has flow control mechanism, so server will acknowledge received
        DATA frames as a message only after user consumes this coroutine.

        :returns: message
        """
        message = await recv_message(self._stream, self._codec, self._recv_type)
        if message is not None:
            message, = await self._dispatch.recv_message(message)
            self._messages_received += 1
            self._stream.connection.messages_received += 1
            self._stream.connection.last_message_received = time.monotonic()
            return message  # type: ignore[no-any-return]
        else:
            return None

    async def send_initial_metadata(
        self,
        *,
        metadata: Optional[_MetadataLike] = None,
    ) -> None:
        """Coroutine to send headers with initial metadata to the client.

        In gRPC you can send initial metadata as soon as possible, because
        gRPC doesn't use `:status` pseudo header to indicate success or failure
        of the current request. gRPC uses trailers for this purpose, and
        trailers are sent during :py:meth:`send_trailing_metadata` call, which
        should be called in the end.

        .. note:: This coroutine will be called implicitly during first
            :py:meth:`send_message` coroutine call, if not called before
            explicitly.

        :param metadata: custom initial metadata, dict or list of pairs
        """
        if self._send_initial_metadata_done:
            raise ProtocolError('Initial metadata was already sent')

        headers = [
            (':status', '200'),
            ('content-type', self._content_type),
        ]
        metadata = MultiDict(metadata or ())
        metadata, = await self._dispatch.send_initial_metadata(metadata)
        headers.extend(encode_metadata(cast(_Metadata, metadata)))

        await self._stream.send_headers(headers)
        self._send_initial_metadata_done = True

    async def send_message(self, message: _SendType) -> None:
        """Coroutine to send message to the client.

        If server sends UNARY response, then you should call this coroutine only
        once. If server sends STREAM response, then you can call this coroutine
        as many times as you need.

        :param message: message object
        """
        if not self._send_initial_metadata_done:
            await self.send_initial_metadata()

        if not self._cardinality.server_streaming:
            if self._send_message_done:
                raise ProtocolError('Message was already sent')

        message, = await self._dispatch.send_message(message)
        await send_message(self._stream, self._codec, message, self._send_type)
        self._send_message_done = True
        self._messages_sent += 1
        self._stream.connection.messages_sent += 1
        self._stream.connection.last_message_sent = time.monotonic()

    async def send_trailing_metadata(
        self,
        *,
        status: Status = Status.OK,
        status_message: Optional[str] = None,
        status_details: Any = None,
        metadata: Optional[_MetadataLike] = None,
    ) -> None:
        """Coroutine to send trailers with trailing metadata to the client.

        This coroutine allows sending trailers-only responses, in case of some
        failure conditions during handling current request, i.e. when
        ``status is not OK``.

        .. note:: This coroutine will be called implicitly at exit from
            request handler, with appropriate status code, if not called
            explicitly during handler execution.

        :param status: resulting status of this coroutine call
        :param status_message: description for a status
        :param metadata: custom trailing metadata, dict or list of pairs
        """
        if self._send_trailing_metadata_done:
            raise ProtocolError('Trailing metadata was already sent')

        if (
            not self._cardinality.server_streaming
            and not self._send_message_done
            and status is Status.OK
        ):
            raise ProtocolError('Unary response with OK status requires '
                                'a single message to be sent')

        if self._send_initial_metadata_done:
            headers: _Headers = []
        else:
            # trailers-only response
            headers = [
                (':status', '200'),
                ('content-type', self._content_type),
            ]

        headers.append(('grpc-status', str(status.value)))
        if status_message is not None:
            headers.append(('grpc-message',
                            encode_grpc_message(status_message)))
        if (
            status_details is not None
            and self._status_details_codec is not None
        ):
            status_details_bin = (
                encode_bin_value(self._status_details_codec.encode(
                    status, status_message, status_details,
                )).decode('ascii')
            )
            headers.append((_STATUS_DETAILS_KEY, status_details_bin))

        metadata = MultiDict(metadata or ())
        metadata, = await self._dispatch.send_trailing_metadata(
            metadata,
            status=status,
            status_message=status_message,
            status_details=status_details,
        )
        headers.extend(encode_metadata(cast(_Metadata, metadata)))

        await self._stream.send_headers(headers, end_stream=True)
        self._send_trailing_metadata_done = True

        if status != Status.OK and self._stream.closable:
            self._stream.reset_nowait()

    async def cancel(self) -> None:
        """Coroutine to cancel this request/stream.

        Server will send RST_STREAM frame to the client, so it will be
        explicitly informed that there is nothing to expect from the server
        regarding this request/stream.
        """
        if self._cancel_done:
            raise ProtocolError('Stream was already cancelled')

        await self._stream.reset()  # TODO: specify error code
        self._cancel_done = True

    async def __aenter__(self) -> 'Stream[_RecvType, _SendType]':
        return self

    async def __aexit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> Optional[bool]:
        if (
            self._send_trailing_metadata_done
            or self._cancel_done
            or self._stream._transport.is_closing()
        ):
            # to suppress exception propagation
            return True

        protocol_error = None
        if exc_val is not None:
            # This error should be logged by ``request_handler``, here we
            # have to convert it into trailers and send to the client using
            # ``send_trailing_metadata`` method.
            if isinstance(exc_val, GRPCError):
                status = exc_val.status
                status_message = exc_val.message
                status_details = exc_val.details
            elif isinstance(exc_val, Exception):
                status = Status.UNKNOWN
                status_message = 'Internal Server Error'
                status_details = None
            else:
                # propagate exception
                return None
        elif (
            # There is a possibility of a ``ProtocolError`` in the
            # ``send_trailing_metadata`` method, so we are checking for such
            # errors here
            not self._cardinality.server_streaming
            and not self._send_message_done
        ):
            status = Status.UNKNOWN
            status_message = 'Internal Server Error'
            status_details = None
            protocol_error = ('Unary response with OK status requires '
                              'a single message to be sent: {!r}'
                              .format(self._method_name))
        else:
            status = Status.OK
            status_message = None
            status_details = None

        try:
            await self.send_trailing_metadata(status=status,
                                              status_message=status_message,
                                              status_details=status_details)
        except h2.exceptions.StreamClosedError:
            pass

        if protocol_error is not None:
            raise ProtocolError(protocol_error)

        # to suppress exception propagation
        return True


async def _abort(
    h2_stream: 'protocol.Stream',
    h2_status: int,
    grpc_status: Optional[Status] = None,
    grpc_message: Optional[str] = None,
) -> None:
    headers = [(':status', str(h2_status))]
    if grpc_status is not None:
        headers.append(('grpc-status', str(grpc_status.value)))
    if grpc_message is not None:
        headers.append(('grpc-message', grpc_message))
    await h2_stream.send_headers(headers, end_stream=True)
    if h2_stream.closable:
        h2_stream.reset_nowait()


async def request_handler(
    mapping: Dict[str, 'const.Handler'],
    _stream: 'protocol.Stream',
    headers: _Headers,
    codec: CodecBase,
    status_details_codec: Optional[StatusDetailsCodecBase],
    dispatch: _DispatchServerEvents,
    release_stream: Callable[[], Any],
) -> None:
    try:
        headers_map = dict(headers)

        if headers_map[':method'] != 'POST':
            await _abort(_stream, 405)
            return

        content_type = headers_map.get('content-type')
        if content_type is None:
            await _abort(_stream, 415, Status.UNKNOWN,
                         'Missing content-type header')
            return

        base_content_type, _, sub_type = content_type.partition('+')
        sub_type = sub_type or ProtoCodec.__content_subtype__
        if (
            base_content_type != GRPC_CONTENT_TYPE
            or sub_type != codec.__content_subtype__
        ):
            await _abort(_stream, 415, Status.UNKNOWN,
                         'Unacceptable content-type header')
            return

        if headers_map.get('te') != 'trailers':
            await _abort(_stream, 400, Status.UNKNOWN,
                         'Required "te: trailers" header is missing')
            return

        method_name = headers_map[':path']
        method = mapping.get(method_name)
        if method is None:
            await _abort(_stream, 200, Status.UNIMPLEMENTED,
                         'Method not found')
            return

        try:
            deadline = Deadline.from_headers(headers)
        except ValueError:
            await _abort(_stream, 200, Status.UNKNOWN,
                         'Invalid grpc-timeout header')
            return

        metadata = decode_metadata(headers)
        user_agent = headers_map.get('user-agent')

        async with Stream(
            _stream, method_name, method.cardinality,
            method.request_type, method.reply_type,
            codec=codec, status_details_codec=status_details_codec,
            dispatch=dispatch, deadline=deadline, user_agent=user_agent,
        ) as stream:
            deadline_wrapper: 'ContextManager[Any]'
            if deadline is None:
                wrapper = _stream.wrapper = Wrapper()
                deadline_wrapper = nullcontext()
            else:
                wrapper = _stream.wrapper = DeadlineWrapper()
                deadline_wrapper = wrapper.start(deadline)
            try:
                with deadline_wrapper, wrapper:
                    stream.metadata, method_func = await dispatch.recv_request(
                        metadata,
                        method.func,
                        method_name=method_name,
                        deadline=deadline,
                        content_type=content_type,
                        user_agent=user_agent,
                        peer=stream.peer,
                    )
                    await method_func(stream)
            except GRPCError:
                raise
            except asyncio.TimeoutError:
                if wrapper.cancel_failed:
                    log.exception('Failed to handle cancellation')
                    raise GRPCError(Status.DEADLINE_EXCEEDED)
                elif wrapper.cancelled:
                    log.info('Deadline exceeded')
                    raise GRPCError(Status.DEADLINE_EXCEEDED)
                else:
                    log.exception('Timeout occurred')
                    raise
            except StreamTerminatedError as err:
                if wrapper.cancel_failed:
                    log.exception('Failed to handle cancellation')
                    raise
                else:
                    assert wrapper.cancelled
                    log.info('Request was cancelled: %s', err)
                    raise
            except Exception:
                log.exception('Application error')
                raise
    except ProtocolError:
        log.exception('Application error')
    except Exception:
        log.exception('Server error')
    finally:
        release_stream()


class _GC(abc.ABC):
    _gc_counter = 0

    @property
    @abc.abstractmethod
    def __gc_interval__(self) -> int:
        raise NotImplementedError

    @abc.abstractmethod
    def __gc_collect__(self) -> None:
        pass

    def __gc_step__(self) -> None:
        self._gc_counter += 1
        if not (self._gc_counter % self.__gc_interval__):
            self.__gc_collect__()


class Handler(_GC, AbstractHandler):
    __gc_interval__ = 10

    closing = False

    def __init__(
        self,
        mapping: Dict[str, 'const.Handler'],
        codec: CodecBase,
        status_details_codec: Optional[StatusDetailsCodecBase],
        dispatch: _DispatchServerEvents,
    ) -> None:
        self.mapping = mapping
        self.codec = codec
        self.status_details_codec = status_details_codec
        self.dispatch = dispatch
        self.loop = asyncio.get_event_loop()
        self._tasks: Dict['protocol.Stream', 'asyncio.Task[None]'] = {}
        self._cancelled: Set['asyncio.Task[None]'] = set()

    def __gc_collect__(self) -> None:
        self._tasks = {s: t for s, t in self._tasks.items()
                       if not t.done()}
        self._cancelled = {t for t in self._cancelled
                           if not t.done()}

    def accept(
        self,
        stream: 'protocol.Stream',
        headers: _Headers,
        release_stream: Callable[[], Any],
    ) -> None:
        self.__gc_step__()
        self._tasks[stream] = self.loop.create_task(request_handler(
            self.mapping, stream, headers, self.codec,
            self.status_details_codec, self.dispatch, release_stream,
        ))

    def cancel(self, stream: 'protocol.Stream') -> None:
        task = self._tasks.pop(stream)
        task.cancel()
        self._cancelled.add(task)

    def close(self) -> None:
        for task in self._tasks.values():
            task.cancel()
        self._cancelled.update(self._tasks.values())
        self.closing = True

    async def wait_closed(self) -> None:
        if self._cancelled:
            await asyncio.wait(self._cancelled)

    def check_closed(self) -> bool:
        self.__gc_collect__()
        return not self._tasks and not self._cancelled


class Server(_GC):
    """
    HTTP/2 server, which uses gRPC service handlers to handle requests.

    Handler is a subclass of the abstract base class, which was generated
    from .proto file:

    .. code-block:: python3

        class CoffeeMachine(cafe_grpc.CoffeeMachineBase):

            async def MakeLatte(self, stream):
                task: cafe_pb2.LatteOrder = await stream.recv_message()
                ...
                await stream.send_message(empty_pb2.Empty())

        server = Server([CoffeeMachine()])
    """
    __gc_interval__ = 10

    def __init__(
        self,
        handlers: Collection['IServable'],
        *,
        loop: Optional[asyncio.AbstractEventLoop] = None,
        codec: Optional[CodecBase] = None,
        status_details_codec: Optional[StatusDetailsCodecBase] = None,
        config: Optional[Configuration] = None,
    ) -> None:
        """
        :param handlers: list of handlers

        :param loop: (deprecated) asyncio-compatible event loop

        :param codec: instance of a codec to encode and decode messages,
            if omitted ``ProtoCodec`` is used by default

        :param status_details_codec: instance of a status details codec to
            encode error details in a trailing metadata, if omitted
            ``ProtoStatusDetailsCodec`` is used by default
        """
        if loop:
            warnings.warn("The loop argument is deprecated and scheduled "
                          "for removal in grpclib 0.5",
                          DeprecationWarning, stacklevel=2)

        mapping: Dict[str, 'const.Handler'] = {}
        for handler in handlers:
            mapping.update(handler.__mapping__())

        self._mapping = mapping
        self._loop = loop or asyncio.get_event_loop()

        if codec is None:
            codec = ProtoCodec()
            if status_details_codec is None and _googleapis_available():
                status_details_codec = ProtoStatusDetailsCodec()

        self._codec = codec
        self._status_details_codec = status_details_codec

        self._h2_config = h2.config.H2Configuration(
            client_side=False,
            header_encoding='ascii',
            validate_inbound_headers=False,
            validate_outbound_headers=False,
            normalize_inbound_headers=False,
            normalize_outbound_headers=False,
        )

        config = Configuration() if config is None else config
        self._config = config.__for_server__()

        self._server: Optional[asyncio.AbstractServer] = None
        self._server_closed_fut: Optional[asyncio.Future[None]] = None
        self._handlers: Set[Handler] = set()

        self.__dispatch__ = _DispatchServerEvents()
        _servers.add(self)

    def __gc_collect__(self) -> None:
        self._handlers = {h for h in self._handlers
                          if not (h.closing and h.check_closed())}

    def _protocol_factory(self) -> H2Protocol:
        self.__gc_step__()
        handler = Handler(
            self._mapping, self._codec, self._status_details_codec,
            self.__dispatch__,
        )
        self._handlers.add(handler)
        return H2Protocol(handler, self._config, self._h2_config)

    async def start(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        *,
        path: Optional[str] = None,
        family: 'socket.AddressFamily' = socket.AF_UNSPEC,
        flags: 'socket.AddressInfo' = socket.AI_PASSIVE,
        sock: Optional[socket.socket] = None,
        backlog: int = 100,
        ssl: Optional['_ssl.SSLContext'] = None,
        reuse_address: Optional[bool] = None,
        reuse_port: Optional[bool] = None,
    ) -> None:
        """Coroutine to start the server.

        :param host: can be a string, containing IPv4/v6 address or domain name.
            If host is None, server will be bound to all available interfaces.

        :param port: port number.

        :param path: UNIX domain socket path. If specified, host and port should
            be omitted (must be None).

        :param family: can be set to either :py:data:`python:socket.AF_INET` or
            :py:data:`python:socket.AF_INET6` to force the socket to use IPv4 or
            IPv6. If not set it will be determined from host.

        :param flags: is a bitmask for
            :py:meth:`~python:asyncio.AbstractEventLoop.getaddrinfo`.

        :param sock: sock can optionally be specified in order to use a
            preexisting socket object. If specified, host and port should be
            omitted (must be None).

        :param backlog: is the maximum number of queued connections passed to
            listen().

        :param ssl: can be set to an :py:class:`~python:ssl.SSLContext`
            to enable SSL over the accepted connections.

        :param reuse_address: tells the kernel to reuse a local socket in
            TIME_WAIT state, without waiting for its natural timeout to expire.

        :param reuse_port: tells the kernel to allow this endpoint to be bound
            to the same port as other existing endpoints are bound to,
            so long as they all set this flag when being created.
        """
        if path is not None and (host is not None or port is not None):
            raise ValueError("The 'path' parameter can not be used with the "
                             "'host' or 'port' parameters.")

        if self._server is not None:
            raise RuntimeError('Server is already started')

        if path is not None:
            self._server = await self._loop.create_unix_server(
                self._protocol_factory, path, sock=sock, backlog=backlog,
                ssl=ssl
            )
        else:
            # FIXME: Not all union combinations were tried because there are
            #  too many unions
            self._server = await self._loop.create_server(  # type: ignore
                self._protocol_factory, host,
                port,  # type: ignore
                family=family, flags=flags,
                sock=sock,  # type: ignore
                backlog=backlog, ssl=ssl,
                reuse_address=reuse_address, reuse_port=reuse_port
            )
        self._server_closed_fut = self._loop.create_future()

    def close(self) -> None:
        """Stops accepting new connections, cancels all currently running
        requests. Request handlers are able to handle `CancelledError` and
        exit properly.
        """
        if self._server is None or self._server_closed_fut is None:
            raise RuntimeError('Server is not started')
        self._server.close()
        if not self._server_closed_fut.done():
            self._server_closed_fut.set_result(None)
        for handler in self._handlers:
            handler.close()

    async def wait_closed(self) -> None:
        """Coroutine to wait until all existing request handlers will exit
        properly.
        """
        if self._server is None or self._server_closed_fut is None:
            raise RuntimeError('Server is not started')
        await self._server_closed_fut
        await self._server.wait_closed()
        if self._handlers:
            await asyncio.wait({
                self._loop.create_task(h.wait_closed()) for h in self._handlers
            })

    async def __aenter__(self) -> 'Server':
        return self

    async def __aexit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> None:
        self.close()
        await self.wait_closed()
