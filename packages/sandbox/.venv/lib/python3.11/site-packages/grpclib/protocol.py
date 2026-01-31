import asyncio
import struct
import time
import socket
import logging

from io import BytesIO
from abc import ABC, abstractmethod
from typing import Optional, List, Tuple, Dict, NamedTuple, Callable, Any
from typing import cast, TYPE_CHECKING
from asyncio import Transport, Protocol, Event, BaseTransport, TimerHandle
from asyncio import Queue
from functools import partial
from collections import deque

from h2.errors import ErrorCodes
from h2.config import H2Configuration
from h2.events import Event as H2Event
from h2.events import RequestReceived, DataReceived, StreamEnded, WindowUpdated
from h2.events import ConnectionTerminated, RemoteSettingsChanged, StreamReset
from h2.events import SettingsAcknowledged, ResponseReceived, TrailersReceived
from h2.events import PriorityUpdated, PingReceived, PingAckReceived
from h2.settings import SettingCodes
from h2.connection import H2Connection, ConnectionState
from h2.exceptions import ProtocolError, TooManyStreamsError, StreamClosedError

from .utils import Wrapper
from .config import Configuration
from .exceptions import StreamTerminatedError


if TYPE_CHECKING:
    from typing import Deque


log = logging.getLogger(__name__)


if hasattr(socket, 'TCP_NODELAY'):
    _sock_type_mask = 0xf if hasattr(socket, 'SOCK_NONBLOCK') else 0xffffffff

    def _set_nodelay(sock: socket.socket) -> None:
        if (
            sock.family in {socket.AF_INET, socket.AF_INET6}
            and sock.type & _sock_type_mask == socket.SOCK_STREAM
            and sock.proto == socket.IPPROTO_TCP
        ):
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
else:
    def _set_nodelay(sock: socket.socket) -> None:
        pass


class UnackedData(NamedTuple):
    data: bytes
    data_size: int
    ack_size: int


class AckedData(NamedTuple):
    data: memoryview
    data_size: int


class Buffer:

    def __init__(self, ack_callback: Callable[[int], None]) -> None:
        self._ack_callback = ack_callback
        self._eof = False
        self._unacked: 'Queue[UnackedData]' = Queue()
        self._acked: 'Deque[AckedData]' = deque()
        self._acked_size = 0

    def add(self, data: bytes, ack_size: int) -> None:
        self._unacked.put_nowait(UnackedData(data, len(data), ack_size))

    def eof(self) -> None:
        self._unacked.put_nowait(UnackedData(b'', 0, 0))
        self._eof = True

    async def read(self, size: int) -> bytes:
        assert size >= 0, 'Size can not be negative'
        if size == 0:
            return b''

        if not self._eof or not self._unacked.empty():
            while self._acked_size < size:
                data, data_size, ack_size = await self._unacked.get()
                if not ack_size:
                    break
                self._acked.append(AckedData(memoryview(data), data_size))
                self._acked_size += data_size
                self._ack_callback(ack_size)

        if self._eof and self._acked_size == 0:
            return b''

        if self._acked_size < size:
            raise AssertionError('Received less data than expected')

        chunks = []
        chunks_size = 0
        while chunks_size < size:
            next_chunk, next_chunk_size = self._acked[0]
            if chunks_size + next_chunk_size <= size:
                chunks.append(next_chunk)
                chunks_size += next_chunk_size
                self._acked.popleft()
            else:
                offset = size - chunks_size
                chunks.append(next_chunk[:offset])
                chunks_size += offset
                self._acked[0] = AckedData(
                    data=next_chunk[offset:],
                    data_size=next_chunk_size - offset,
                )
        self._acked_size -= size
        assert chunks_size == size
        return b''.join(chunks)

    def unacked_size(self) -> int:
        return sum(self._unacked.get_nowait().ack_size
                   for _ in range(self._unacked.qsize()))


class Peer:
    """
    Represents an information about a connection's peer
    """
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    def addr(self) -> Optional[Tuple[str, int]]:
        """Returns the remote address to which we are connected"""
        return self._transport.get_extra_info('peername')  # type: ignore

    def cert(self) -> Optional[Dict[str, Any]]:
        """Returns the peer certificate

        Result of the :py:meth:`python:ssl.SSLSocket.getpeercert`
        """
        ssl_object = self._transport.get_extra_info('ssl_object')
        if ssl_object is not None:
            return ssl_object.getpeercert()  # type: ignore
        else:
            return None


class Connection:
    """
    Holds connection state (write_ready), and manages
    H2Connection <-> Transport communication
    """
    # stats
    streams_started = 0
    streams_succeeded = 0
    streams_failed = 0
    data_sent = 0
    data_received = 0
    messages_sent = 0
    messages_received = 0
    last_stream_created: Optional[float] = None
    last_data_sent: Optional[float] = None
    last_data_received: Optional[float] = None
    last_message_sent: Optional[float] = None
    last_message_received: Optional[float] = None
    last_ping_sent: Optional[float] = None
    ping_count_in_sequence: int = 0
    _ping_handle: Optional[TimerHandle] = None
    _close_by_ping_handler: Optional[TimerHandle] = None

    def __init__(
        self,
        connection: H2Connection,
        transport: Transport,
        *,
        config: Configuration,
    ) -> None:
        self._connection = connection
        self._transport = transport
        self._config = config

        self.write_ready = Event()
        self.write_ready.set()

        self.stream_close_waiter = Event()

    def feed(self, data: bytes) -> List[H2Event]:
        return self._connection.receive_data(data)

    def ack(self, stream_id: int, size: int) -> None:
        if size:
            self._connection.acknowledge_received_data(size, stream_id)
            self.flush()

    def pause_writing(self) -> None:
        self.write_ready.clear()

    def resume_writing(self) -> None:
        self.write_ready.set()

    def create_stream(
        self,
        *,
        stream_id: Optional[int] = None,
        wrapper: Optional[Wrapper] = None,
    ) -> 'Stream':
        return Stream(self, self._connection, self._transport,
                      stream_id=stream_id, wrapper=wrapper)

    def flush(self) -> None:
        data = self._connection.data_to_send()
        if data:
            self._transport.write(data)

    def initialize(self) -> None:
        if self._config._keepalive_time is not None:
            self._ping_handle = asyncio.get_event_loop().call_later(
                self._config._keepalive_time,
                self._ping
            )

    def get_peer(self) -> Peer:
        return Peer(self._transport)

    def is_closing(self) -> bool:
        if hasattr(self, '_transport'):
            return self._transport.is_closing()
        else:
            return True

    def close(self) -> None:
        if hasattr(self, '_transport'):
            self._transport.close()
            # remove cyclic references to improve memory usage
            del self._transport
            if hasattr(self._connection, '_frame_dispatch_table'):
                del self._connection._frame_dispatch_table
        if self._ping_handle is not None:
            self._ping_handle.cancel()
        if self._close_by_ping_handler is not None:
            self._close_by_ping_handler.cancel()

    def _is_need_send_ping(self) -> bool:
        assert self._config._keepalive_time is not None

        if not self._config._keepalive_permit_without_calls:
            if not any(s.open for s in self._connection.streams.values()):
                return False

        if self._config._http2_max_pings_without_data != 0 and \
                self.ping_count_in_sequence >= \
                self._config._http2_max_pings_without_data:
            return False

        if self.last_ping_sent is not None and \
                time.monotonic() - self.last_ping_sent < \
                self._config._http2_min_sent_ping_interval_without_data:
            return False

        return True

    def _ping(self) -> None:
        assert self._config._keepalive_time is not None
        if self._is_need_send_ping():
            log.debug('send ping')
            data = struct.pack('!Q', int(time.monotonic() * 10 ** 6))
            self._connection.ping(data)
            self.flush()
            self.last_ping_sent = time.monotonic()
            self.ping_count_in_sequence += 1
            if self._close_by_ping_handler is None:
                self._close_by_ping_handler = asyncio.get_event_loop().\
                    call_later(
                        self._config._keepalive_timeout,
                        self.close
                    )
        self._ping_handle = asyncio.get_event_loop().call_later(
            self._config._keepalive_time,
            self._ping
        )

    def headers_send_process(self) -> None:
        self.ping_count_in_sequence = 0

    def data_send_process(self) -> None:
        self.ping_count_in_sequence = 0
        self.last_data_sent = time.monotonic()

    def ping_ack_process(self) -> None:
        if self._close_by_ping_handler is not None:
            self._close_by_ping_handler.cancel()
            self._close_by_ping_handler = None


_Headers = List[Tuple[str, str]]


class Stream:
    """
    API for working with streams, used by clients and request handlers
    """
    id: Optional[int] = None

    # stats
    created: Optional[float] = None
    data_sent = 0
    data_received = 0

    def __init__(
        self,
        connection: Connection,
        h2_connection: H2Connection,
        transport: Transport,
        *,
        stream_id: Optional[int] = None,
        wrapper: Optional[Wrapper] = None
    ) -> None:
        self.connection = connection
        self._h2_connection = h2_connection
        self._transport = transport
        self.wrapper = wrapper

        if stream_id is not None:
            self.init_stream(stream_id, self.connection)

        self.window_updated = Event()
        self.headers: Optional['_Headers'] = None
        self.headers_received = Event()
        self.trailers: Optional['_Headers'] = None
        self.trailers_received = Event()

    def init_stream(self, stream_id: int, connection: Connection) -> None:
        self.id = stream_id
        self.buffer = Buffer(partial(connection.ack, self.id))

        self.connection.streams_started += 1
        self.created = self.connection.last_stream_created = time.monotonic()

    async def recv_headers(self) -> _Headers:
        if self.headers is None:
            await self.headers_received.wait()
        assert self.headers is not None
        return self.headers

    async def recv_data(self, size: int) -> bytes:
        return await self.buffer.read(size)

    async def recv_trailers(self) -> _Headers:
        if self.trailers is None:
            await self.trailers_received.wait()
        assert self.trailers is not None
        return self.trailers

    async def send_request(
        self,
        headers: _Headers,
        end_stream: bool = False,
        *,
        _processor: 'EventsProcessor',
    ) -> Callable[[], None]:
        assert self.id is None, self.id
        while True:
            # this is the first thing we should check before even trying to
            # create new stream, because this wait() can be cancelled by timeout
            # and we wouldn't need to create new stream at all
            await self.connection.write_ready.wait()

            # `get_next_available_stream_id()` should be as close to
            # `connection.send_headers()` as possible, without any async
            # interruptions in between, see the docs on the
            # `get_next_available_stream_id()` method
            stream_id = self._h2_connection.get_next_available_stream_id()
            try:
                self._h2_connection.send_headers(stream_id, headers,
                                                 end_stream=end_stream)
            except TooManyStreamsError:
                # we're going to wait until any of currently opened streams will
                # be closed, and we will be able to open a new one
                # TODO: maybe implement FIFO for waiters, but this limit
                #       shouldn't be reached in a normal case, so why bother
                # TODO: maybe we should raise an exception here instead of
                #       waiting, if timeout wasn't set for the current request
                self.connection.stream_close_waiter.clear()
                await self.connection.stream_close_waiter.wait()
                # while we were trying to create a new stream, write buffer
                # can became full, so we need to repeat checks from checking
                # if we can write() data
                continue
            else:
                self.init_stream(stream_id, self.connection)
                release_stream = _processor.register(self)
                self._transport.write(self._h2_connection.data_to_send())
                self.connection.headers_send_process()
                return release_stream

    async def send_headers(
        self,
        headers: _Headers,
        end_stream: bool = False,
    ) -> None:
        assert self.id is not None
        await self.connection.write_ready.wait()

        # Workaround for the H2Connection.send_headers method, which will try
        # to create a new stream if it was removed earlier from the
        # H2Connection.streams, and therefore will raise StreamIDTooLowError
        if self.id not in self._h2_connection.streams:
            raise StreamClosedError(self.id)

        self._h2_connection.send_headers(self.id, headers,
                                         end_stream=end_stream)
        self._transport.write(self._h2_connection.data_to_send())
        self.connection.headers_send_process()

    async def send_data(self, data: bytes, end_stream: bool = False) -> None:
        assert self.id is not None
        f = BytesIO(data)
        f_pos, f_last = 0, len(data)

        while True:
            await self.connection.write_ready.wait()

            window = self._h2_connection.local_flow_control_window(self.id)
            # window can become negative
            if not window > 0:
                self.window_updated.clear()
                await self.window_updated.wait()
                # during "await" above other streams were able to send data and
                # decrease current window size, so try from the beginning
                continue

            max_frame_size = self._h2_connection.max_outbound_frame_size
            f_chunk = f.read(min(window, max_frame_size, f_last - f_pos))
            f_chunk_len = len(f_chunk)
            f_pos = f.tell()

            if f_pos == f_last:
                self._h2_connection.send_data(self.id, f_chunk,
                                              end_stream=end_stream)
                self._transport.write(self._h2_connection.data_to_send())
                self.data_sent += f_chunk_len
                self.connection.data_sent += f_chunk_len
                self.connection.data_send_process()
                break
            else:
                self._h2_connection.send_data(self.id, f_chunk)
                self._transport.write(self._h2_connection.data_to_send())
                self.data_sent += f_chunk_len
                self.connection.data_sent += f_chunk_len
                self.connection.data_send_process()

    async def end(self) -> None:
        assert self.id is not None
        await self.connection.write_ready.wait()
        self._h2_connection.end_stream(self.id)
        self._transport.write(self._h2_connection.data_to_send())

    async def reset(self, error_code: ErrorCodes = ErrorCodes.NO_ERROR) -> None:
        assert self.id is not None
        await self.connection.write_ready.wait()
        self._h2_connection.reset_stream(self.id, error_code=error_code)
        self._transport.write(self._h2_connection.data_to_send())

    def reset_nowait(
        self,
        error_code: ErrorCodes = ErrorCodes.NO_ERROR,
    ) -> None:
        assert self.id is not None
        self._h2_connection.reset_stream(self.id, error_code=error_code)
        if self.connection.write_ready.is_set():
            self._transport.write(self._h2_connection.data_to_send())

    def __ended__(self) -> None:
        self.buffer.eof()

    def __terminated__(self, reason: str) -> None:
        if self.wrapper is not None:
            self.wrapper.cancel(StreamTerminatedError(reason))

    @property
    def closable(self) -> bool:
        assert self.id is not None
        if self._transport.is_closing():
            return False
        if self._h2_connection.state_machine.state is ConnectionState.CLOSED:
            return False
        stream = self._h2_connection.streams.get(self.id)
        if stream is None:
            return False
        return not stream.closed


class AbstractHandler(ABC):

    @abstractmethod
    def accept(
        self,
        stream: Stream,
        headers: _Headers,
        release_stream: Callable[[], None],
    ) -> None:
        pass

    @abstractmethod
    def cancel(self, stream: Stream) -> None:
        pass

    @abstractmethod
    def close(self) -> None:
        pass


_Streams = Dict[int, Stream]


class EventsProcessor:
    """
    H2 events processor, synchronous, not doing any IO, as hyper-h2 itself
    """
    def __init__(
        self,
        handler: AbstractHandler,
        connection: Connection,
    ) -> None:
        self.handler = handler
        self.connection = connection

        self.processors = {
            RequestReceived: self.process_request_received,
            ResponseReceived: self.process_response_received,
            RemoteSettingsChanged: self.process_remote_settings_changed,
            SettingsAcknowledged: self.process_settings_acknowledged,
            DataReceived: self.process_data_received,
            WindowUpdated: self.process_window_updated,
            TrailersReceived: self.process_trailers_received,
            StreamEnded: self.process_stream_ended,
            StreamReset: self.process_stream_reset,
            PriorityUpdated: self.process_priority_updated,
            ConnectionTerminated: self.process_connection_terminated,
            PingReceived: self.process_ping_received,
            PingAckReceived: self.process_ping_ack_received,
        }

        self.streams: _Streams = {}

    def register(self, stream: Stream) -> Callable[[], None]:
        assert stream.id is not None
        self.streams[stream.id] = stream

        def release_stream(*, _streams: _Streams = self.streams) -> None:
            assert stream.id is not None
            _stream = _streams.pop(stream.id)
            self.connection.stream_close_waiter.set()
            if not self.connection.is_closing():
                self.connection.ack(stream.id, _stream.buffer.unacked_size())

        return release_stream

    def close(self, reason: str = 'Connection closed') -> None:
        self.connection.close()
        self.handler.close()
        for stream in self.streams.values():
            stream.__terminated__(reason)
        # remove cyclic references to improve memory usage
        if hasattr(self, 'processors'):
            del self.processors

    def process(self, event: H2Event) -> None:
        try:
            proc = self.processors[event.__class__]
        except KeyError:
            raise NotImplementedError(event)
        except AttributeError:
            pass  # connection was closed and self.processors was deleted
        else:
            proc(event)  # type: ignore[operator]

    def process_request_received(self, event: RequestReceived) -> None:
        stream = self.connection.create_stream(stream_id=event.stream_id)
        release_stream = self.register(stream)
        self.handler.accept(
            stream,
            event.headers,  # type: ignore[arg-type]
            release_stream,
        )
        # TODO: check EOF

    def process_response_received(self, event: ResponseReceived) -> None:
        stream = self.streams.get(event.stream_id)
        if stream is not None:
            stream.headers = event.headers  # type: ignore[assignment]
            stream.headers_received.set()

    def process_remote_settings_changed(
        self,
        event: RemoteSettingsChanged,
    ) -> None:
        if SettingCodes.INITIAL_WINDOW_SIZE in event.changed_settings:
            for stream in self.streams.values():
                stream.window_updated.set()

    def process_settings_acknowledged(
        self,
        event: SettingsAcknowledged,
    ) -> None:
        pass

    def process_data_received(self, event: DataReceived) -> None:
        size = len(event.data)
        stream = self.streams.get(event.stream_id)
        if stream is not None:
            stream.buffer.add(
                event.data,
                event.flow_controlled_length,
            )
            stream.data_received += size
        else:
            self.connection.ack(
                event.stream_id,
                event.flow_controlled_length,
            )
        self.connection.data_received += size
        self.connection.last_data_received = time.monotonic()

    def process_window_updated(self, event: WindowUpdated) -> None:
        if event.stream_id == 0:
            for value in self.streams.values():
                value.window_updated.set()
        else:
            stream = self.streams.get(event.stream_id)
            if stream is not None:
                stream.window_updated.set()

    def process_trailers_received(self, event: TrailersReceived) -> None:
        stream = self.streams.get(event.stream_id)
        if stream is not None:
            stream.trailers = event.headers  # type: ignore[assignment]
            stream.trailers_received.set()

    def process_stream_ended(self, event: StreamEnded) -> None:
        stream = self.streams.get(event.stream_id)
        if stream is not None:
            stream.__ended__()

        self.connection.streams_succeeded += 1

    def process_stream_reset(self, event: StreamReset) -> None:
        stream = self.streams.get(event.stream_id)
        if stream is not None:
            if event.remote_reset:
                msg = ('Stream reset by remote party, error_code: {}'
                       .format(event.error_code))
            else:
                msg = 'Protocol error'
            stream.__terminated__(msg)
            self.handler.cancel(stream)

        self.connection.streams_failed += 1

    def process_priority_updated(self, event: PriorityUpdated) -> None:
        pass

    def process_connection_terminated(
        self,
        event: ConnectionTerminated,
    ) -> None:
        self.close(reason=(
            'Received GOAWAY frame, closing connection; error_code: {}'
            .format(event.error_code)
        ))

    def process_ping_received(self, event: PingReceived) -> None:
        pass

    def process_ping_ack_received(self, event: PingAckReceived) -> None:
        self.connection.ping_ack_process()


class H2Protocol(Protocol):
    connection: Connection
    processor: EventsProcessor

    def __init__(
        self,
        handler: AbstractHandler,
        config: Configuration,
        h2_config: H2Configuration,
    ) -> None:
        self.handler = handler
        self.config = config
        self.h2_config = h2_config

    def connection_made(self, transport: BaseTransport) -> None:
        sock = transport.get_extra_info('socket')
        if sock is not None:
            _set_nodelay(sock)

        h2_conn = H2Connection(config=self.h2_config)
        h2_conn.initiate_connection()

        initial = h2_conn.local_settings.initial_window_size
        conn_delta = self.config.http2_connection_window_size - initial
        stream_delta = self.config.http2_stream_window_size - initial
        if conn_delta:
            h2_conn.increment_flow_control_window(conn_delta)
        if stream_delta:
            h2_conn.update_settings({
                SettingCodes.INITIAL_WINDOW_SIZE:
                    self.config.http2_stream_window_size,
            })

        self.connection = Connection(
            h2_conn,
            cast(Transport, transport),
            config=self.config,
        )
        self.connection.flush()
        self.connection.initialize()

        self.processor = EventsProcessor(self.handler, self.connection)

    def data_received(self, data: bytes) -> None:
        try:
            events = self.connection.feed(data)
        except ProtocolError:
            log.debug('Protocol error', exc_info=True)
            self.processor.close('Protocol error')
        else:
            self.connection.flush()
            for event in events:
                self.processor.process(event)
            self.connection.flush()

    def pause_writing(self) -> None:
        self.connection.pause_writing()

    def resume_writing(self) -> None:
        self.connection.resume_writing()

    def connection_lost(self, exc: Optional[BaseException]) -> None:
        self.processor.close(reason='Connection lost')
