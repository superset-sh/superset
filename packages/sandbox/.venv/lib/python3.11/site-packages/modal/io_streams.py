# Copyright Modal Labs 2022
import asyncio
import codecs
import contextlib
import io
import sys
import time
from collections.abc import AsyncGenerator, AsyncIterator
from dataclasses import dataclass
from typing import (
    TYPE_CHECKING,
    Generic,
    Literal,
    Optional,
    TextIO,
    TypeVar,
    Union,
    cast,
)

from grpclib.exceptions import StreamTerminatedError

from modal.exception import ClientClosed, ExecTimeoutError, InvalidError
from modal_proto import api_pb2

from ._utils.async_utils import aclosing, synchronize_api, synchronizer
from ._utils.task_command_router_client import TaskCommandRouterClient
from .client import _Client
from .config import logger
from .exception import ConflictError, InternalError, ServiceError
from .stream_type import StreamType

if TYPE_CHECKING:
    pass


async def _sandbox_logs_iterator(
    sandbox_id: str, file_descriptor: "api_pb2.FileDescriptor.ValueType", last_entry_id: str, client: _Client
) -> AsyncGenerator[tuple[Optional[bytes], str], None]:
    req = api_pb2.SandboxGetLogsRequest(
        sandbox_id=sandbox_id,
        file_descriptor=file_descriptor,
        timeout=55,
        last_entry_id=last_entry_id,
    )
    async for log_batch in client.stub.SandboxGetLogs.unary_stream(req):
        last_entry_id = log_batch.entry_id

        for message in log_batch.items:
            yield (message.data.encode("utf-8"), last_entry_id)
        if log_batch.eof:
            yield (None, last_entry_id)
            break


async def _container_process_logs_iterator(
    process_id: str,
    file_descriptor: "api_pb2.FileDescriptor.ValueType",
    client: _Client,
    last_index: int,
    deadline: Optional[float] = None,
) -> AsyncGenerator[tuple[Optional[bytes], int], None]:
    req = api_pb2.ContainerExecGetOutputRequest(
        exec_id=process_id,
        timeout=55,
        file_descriptor=file_descriptor,
        get_raw_bytes=True,
        last_batch_index=last_index,
    )
    stream = client.stub.ContainerExecGetOutput.unary_stream(req)
    while True:
        # Check deadline before attempting to receive the next batch
        try:
            remaining = (deadline - time.monotonic()) if deadline else None
            batch = await asyncio.wait_for(stream.__anext__(), timeout=remaining)
        except asyncio.TimeoutError:
            yield None, -1
            break
        except StopAsyncIteration:
            break

        for item in batch.items:
            yield item.message_bytes, batch.batch_index

        if batch.HasField("exit_code"):
            yield None, batch.batch_index
            break


T = TypeVar("T", str, bytes)


class _StreamReaderThroughServer(Generic[T]):
    """A StreamReader implementation that reads from the server."""

    _stream: Optional[AsyncGenerator[T, None]]

    def __init__(
        self,
        file_descriptor: "api_pb2.FileDescriptor.ValueType",
        object_id: str,
        object_type: Literal["sandbox", "container_process"],
        client: _Client,
        stream_type: StreamType = StreamType.PIPE,
        text: bool = True,
        by_line: bool = False,
        deadline: Optional[float] = None,
    ) -> None:
        """mdmd:hidden"""
        self._file_descriptor = file_descriptor
        self._object_type = object_type
        self._object_id = object_id
        self._client = client
        self._stream = None
        self._last_entry_id: str = ""
        self._line_buffer = b""
        self._deadline = deadline

        # Sandbox logs are streamed to the client as strings, so StreamReaders reading
        # them must have text mode enabled.
        if object_type == "sandbox" and not text:
            raise ValueError("Sandbox streams must have text mode enabled.")

        self._text = text
        self._by_line = by_line

        # Whether the reader received an EOF. Once EOF is True, it returns
        # an empty string for any subsequent reads (including async for)
        self.eof = False

        if not isinstance(stream_type, StreamType):
            raise TypeError(f"stream_type must be of type StreamType, got {type(stream_type)}")

        # We only support piping sandbox logs because they're meant to be durable logs stored
        # on the user's application.
        if object_type == "sandbox" and stream_type != StreamType.PIPE:
            raise ValueError("Sandbox streams must be piped.")
        self._stream_type = stream_type

        if self._object_type == "container_process":
            # TODO: we should not have this async code in constructors!
            #  it only works as long as all the construction happens inside of synchronicity code
            self._container_process_buffer: list[Optional[bytes]] = []  # TODO: change this to an asyncio.Queue
            self._consume_container_process_task = asyncio.create_task(self._consume_container_process_stream())

    @property
    def file_descriptor(self) -> int:
        """Possible values are `1` for stdout and `2` for stderr."""
        return self._file_descriptor

    async def read(self) -> T:
        """Fetch the entire contents of the stream until EOF."""
        logger.debug(f"{self._object_id} StreamReader fd={self._file_descriptor} read starting")
        if self._text:
            buffer = io.StringIO()
            async for message in _decode_bytes_stream_to_str(self._get_logs()):
                buffer.write(message)
            logger.debug(f"{self._object_id} StreamReader fd={self._file_descriptor} read completed after EOF")
            return cast(T, buffer.getvalue())
        else:
            buffer = io.BytesIO()
            async for message in self._get_logs():
                buffer.write(message)
            logger.debug(f"{self._object_id} StreamReader fd={self._file_descriptor} read completed after EOF")
            return cast(T, buffer.getvalue())

    async def _consume_container_process_stream(self):
        """Consume the container process stream and store messages in the buffer."""
        if self._stream_type == StreamType.DEVNULL:
            return

        completed = False
        retries_remaining = 10
        last_index = 0
        while not completed:
            if self._deadline and time.monotonic() >= self._deadline:
                break
            try:
                iterator = _container_process_logs_iterator(
                    self._object_id, self._file_descriptor, self._client, last_index, self._deadline
                )
                async for message, batch_index in iterator:
                    if self._stream_type == StreamType.STDOUT and message:
                        # TODO: rearchitect this, since these bytes aren't necessarily decodable
                        print(message.decode("utf-8"), end="")  # noqa: T201
                    elif self._stream_type == StreamType.PIPE:
                        self._container_process_buffer.append(message)

                    if message is None:
                        completed = True
                        break
                    else:
                        last_index = batch_index

            except (ServiceError, InternalError, StreamTerminatedError, ClientClosed) as exc:
                if retries_remaining > 0:
                    retries_remaining -= 1
                    if isinstance(exc, (ServiceError, InternalError)):
                        await asyncio.sleep(1.0)
                        continue
                    elif isinstance(exc, StreamTerminatedError):
                        continue
                    elif isinstance(exc, ClientClosed):
                        # If the client was closed, the user has triggered a cleanup.
                        break
                logger.error(f"{self._object_id} stream read failure while consuming process output: {exc}")
                raise exc

    async def _stream_container_process(self) -> AsyncGenerator[tuple[Optional[bytes], str], None]:
        """Streams the container process buffer to the reader."""
        # Container process streams need to be consumed as they are produced,
        # otherwise the process will block. Use a buffer to store the stream
        # until the client consumes it.
        entry_id = 0
        if self._last_entry_id:
            entry_id = int(self._last_entry_id) + 1

        while True:
            if entry_id >= len(self._container_process_buffer):
                await asyncio.sleep(0.1)
                continue

            item = self._container_process_buffer[entry_id]

            yield (item, str(entry_id))
            if item is None:
                break

            entry_id += 1

    async def _get_logs(self, skip_empty_messages: bool = True) -> AsyncGenerator[bytes, None]:
        """Streams sandbox or process logs from the server to the reader.

        Logs returned by this method may contain partial or multiple lines at a time.

        When the stream receives an EOF, it yields None. Once an EOF is received,
        subsequent invocations will not yield logs.
        """
        if self._stream_type != StreamType.PIPE:
            raise InvalidError("Logs can only be retrieved using the PIPE stream type.")

        if self.eof:
            return

        completed = False

        retries_remaining = 10
        while not completed:
            try:
                if self._object_type == "sandbox":
                    iterator = _sandbox_logs_iterator(
                        self._object_id, self._file_descriptor, self._last_entry_id, self._client
                    )
                else:
                    iterator = self._stream_container_process()

                async for message, entry_id in iterator:
                    self._last_entry_id = entry_id
                    # Empty messages are sent when the process boots up. Don't yield them unless
                    # we're using the empty message to signal process liveness.
                    if skip_empty_messages and message == b"":
                        continue

                    if message is None:
                        completed = True
                        self.eof = True
                        return

                    yield message

            except (ServiceError, InternalError, StreamTerminatedError) as exc:
                if retries_remaining > 0:
                    retries_remaining -= 1
                    if isinstance(exc, (ServiceError, InternalError)):
                        await asyncio.sleep(1.0)
                        continue
                    elif isinstance(exc, StreamTerminatedError):
                        continue
                raise

    async def _get_logs_by_line(self) -> AsyncGenerator[bytes, None]:
        """Process logs from the server and yield complete lines only."""
        async for message in self._get_logs():
            assert isinstance(message, bytes)
            self._line_buffer += message
            while b"\n" in self._line_buffer:
                line, self._line_buffer = self._line_buffer.split(b"\n", 1)
                yield line + b"\n"

        if self._line_buffer:
            yield self._line_buffer
            self._line_buffer = b""

    def __aiter__(self) -> AsyncGenerator[T, None]:
        if not self._stream:
            if self._by_line:
                # TODO: This is quite odd - it does line buffering in binary mode
                # but we then always add the buffered text decoding on top of that.
                # feels a bit upside down...
                stream = self._get_logs_by_line()
            else:
                stream = self._get_logs()
            if self._text:
                stream = _decode_bytes_stream_to_str(stream)
            self._stream = cast(AsyncGenerator[T, None], stream)
        return self._stream

    async def aclose(self):
        """mdmd:hidden"""
        if self._stream:
            await self._stream.aclose()


async def _decode_bytes_stream_to_str(stream: AsyncGenerator[bytes, None]) -> AsyncGenerator[str, None]:
    """Incrementally decode a bytes async generator as UTF-8 without breaking on chunk boundaries.

    This function uses a streaming UTF-8 decoder so that multi-byte characters split across
    chunks are handled correctly instead of raising ``UnicodeDecodeError``.
    """
    decoder = codecs.getincrementaldecoder("utf-8")(errors="strict")
    async for item in stream:
        text = decoder.decode(item, final=False)
        if text:
            yield text

    # Flush any buffered partial character at end-of-stream
    tail = decoder.decode(b"", final=True)
    if tail:
        yield tail


async def _stream_by_line(stream: AsyncGenerator[bytes, None]) -> AsyncGenerator[bytes, None]:
    """Yield complete lines only (ending with \n), buffering partial lines until complete.

    When this generator returns, the underlying generator is closed.
    """
    line_buffer = b""
    try:
        async for message in stream:
            assert isinstance(message, bytes)
            line_buffer += message
            while b"\n" in line_buffer:
                line, line_buffer = line_buffer.split(b"\n", 1)
                yield line + b"\n"

        if line_buffer:
            yield line_buffer
    finally:
        await stream.aclose()


@dataclass
class _StreamReaderThroughCommandRouterParams:
    file_descriptor: "api_pb2.FileDescriptor.ValueType"
    task_id: str
    object_id: str
    command_router_client: TaskCommandRouterClient
    deadline: Optional[float]


async def _stdio_stream_from_command_router(
    params: _StreamReaderThroughCommandRouterParams,
) -> AsyncGenerator[bytes, None]:
    """Stream raw bytes from the router client."""
    async with aclosing(
        params.command_router_client.exec_stdio_read(
            params.task_id, params.object_id, params.file_descriptor, params.deadline
        )
    ) as stream:
        try:
            async for item in stream:
                if len(item.data) == 0:
                    # This is an error.
                    raise ValueError("Received empty message streaming stdio from sandbox.")

                yield item.data
        except ExecTimeoutError:
            logger.debug(f"Deadline exceeded while streaming stdio for exec {params.object_id}")
            # TODO(saltzm): This is a weird API, but customers currently may rely on it. We
            # should probably raise this error rather than just ending the stream.
            return


class _BytesStreamReaderThroughCommandRouter:
    """
    StreamReader implementation that will read directly from the worker that
    hosts the sandbox.

    This implementation is used for non-text streams.
    """

    def __init__(
        self,
        params: _StreamReaderThroughCommandRouterParams,
    ) -> None:
        self._params = params
        self._stream = None

    @property
    def file_descriptor(self) -> int:
        return self._params.file_descriptor

    async def read(self) -> bytes:
        buffer = io.BytesIO()
        async for part in self:
            buffer.write(part)
        return buffer.getvalue()

    def __aiter__(self) -> AsyncGenerator[bytes, None]:
        return _stdio_stream_from_command_router(self._params)

    async def _print_all(self, output_stream: TextIO) -> None:
        async for part in self:
            output_stream.buffer.write(part)
            output_stream.buffer.flush()


class _TextStreamReaderThroughCommandRouter:
    """
    StreamReader implementation that will read directly from the worker
    that hosts the sandbox.

    This implementation is used for text streams.
    """

    def __init__(
        self,
        params: _StreamReaderThroughCommandRouterParams,
        by_line: bool,
    ) -> None:
        self._params = params
        self._by_line = by_line

    @property
    def file_descriptor(self) -> int:
        return self._params.file_descriptor

    async def read(self) -> str:
        buffer = io.StringIO()
        async for part in self:
            buffer.write(part)
        return buffer.getvalue()

    async def __aiter__(self) -> AsyncGenerator[str, None]:
        async with aclosing(_stdio_stream_from_command_router(self._params)) as bytes_stream:
            if self._by_line:
                stream = _decode_bytes_stream_to_str(_stream_by_line(bytes_stream))
            else:
                stream = _decode_bytes_stream_to_str(bytes_stream)

            async with aclosing(stream):
                async for part in stream:
                    yield part

    async def _print_all(self, output_stream: TextIO) -> None:
        async with aclosing(self.__aiter__()) as stream:
            async for part in stream:
                output_stream.write(part)


class _StdoutPrintingStreamReaderThroughCommandRouter(Generic[T]):
    """
    StreamReader implementation for StreamType.STDOUT when using the task command router.

    This mirrors the behavior from the server-backed implementation: the stream is printed to
    the local stdout immediately and is not readable via StreamReader methods.
    """

    _reader: Union[_TextStreamReaderThroughCommandRouter, _BytesStreamReaderThroughCommandRouter]

    def __init__(
        self,
        reader: Union[_TextStreamReaderThroughCommandRouter, _BytesStreamReaderThroughCommandRouter],
    ) -> None:
        self._reader = reader
        self._task: Optional[asyncio.Task[None]] = None
        # Kick off a background task that reads from the underlying text stream and prints to stdout.
        self._start_printing_task()

    @property
    def file_descriptor(self) -> int:
        return self._reader.file_descriptor

    def _start_printing_task(self) -> None:
        async def _run():
            try:
                await self._reader._print_all(sys.stdout)
            except Exception as e:
                logger.exception(f"Error printing stream: {e}")

        self._task = asyncio.create_task(_run())

    async def read(self) -> T:
        raise InvalidError("Output can only be retrieved using the PIPE stream type.")

    def __aiter__(self) -> AsyncIterator[T]:
        raise InvalidError("Output can only be retrieved using the PIPE stream type.")

    async def __anext__(self) -> T:
        raise InvalidError("Output can only be retrieved using the PIPE stream type.")

    async def aclose(self):
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None


class _DevnullStreamReader(Generic[T]):
    """StreamReader implementation for a stream configured with
    StreamType.DEVNULL. Throws an error if read or any other method is
    called.
    """

    def __init__(self, file_descriptor: "api_pb2.FileDescriptor.ValueType") -> None:
        self._file_descriptor = file_descriptor

    @property
    def file_descriptor(self) -> int:
        return self._file_descriptor

    async def read(self) -> T:
        raise ValueError("read is not supported for a stream configured with StreamType.DEVNULL")

    def __aiter__(self) -> AsyncIterator[T]:
        raise ValueError("__aiter__ is not supported for a stream configured with StreamType.DEVNULL")

    async def __anext__(self) -> T:
        raise ValueError("__anext__ is not supported for a stream configured with StreamType.DEVNULL")

    async def aclose(self):
        raise ValueError("aclose is not supported for a stream configured with StreamType.DEVNULL")


class _StreamReader(Generic[T]):
    """Retrieve logs from a stream (`stdout` or `stderr`).

    As an asynchronous iterable, the object supports the `for` and `async for`
    statements. Just loop over the object to read in chunks.
    """

    _impl: Union[
        _StreamReaderThroughServer,
        _DevnullStreamReader,
        _TextStreamReaderThroughCommandRouter,
        _BytesStreamReaderThroughCommandRouter,
        _StdoutPrintingStreamReaderThroughCommandRouter,
    ]
    _read_gen: Optional[AsyncGenerator[T, None]] = None

    def __init__(
        self,
        file_descriptor: "api_pb2.FileDescriptor.ValueType",
        object_id: str,
        object_type: Literal["sandbox", "container_process"],
        client: _Client,
        stream_type: StreamType = StreamType.PIPE,
        text: bool = True,
        by_line: bool = False,
        deadline: Optional[float] = None,
        command_router_client: Optional[TaskCommandRouterClient] = None,
        task_id: Optional[str] = None,
    ) -> None:
        """mdmd:hidden"""
        # we can remove this once we ensure no constructors use async code
        assert asyncio.get_running_loop() == synchronizer._get_loop(start=False)

        if by_line and not text:
            raise ValueError("line-buffering is only supported when text=True")

        if command_router_client is None:
            self._impl = _StreamReaderThroughServer(
                file_descriptor, object_id, object_type, client, stream_type, text, by_line, deadline
            )
        else:
            # The only reason task_id is optional is because StreamReader is also used for sandbox
            # logs, which don't have a task ID available when the StreamReader is created.
            assert task_id is not None
            assert object_type == "container_process"
            if stream_type == StreamType.DEVNULL:
                self._impl = _DevnullStreamReader(file_descriptor)
            else:
                assert stream_type == StreamType.PIPE or stream_type == StreamType.STDOUT
                params = _StreamReaderThroughCommandRouterParams(
                    file_descriptor, task_id, object_id, command_router_client, deadline
                )
                if text:
                    reader = _TextStreamReaderThroughCommandRouter(params, by_line)
                else:
                    reader = _BytesStreamReaderThroughCommandRouter(params)

                if stream_type == StreamType.STDOUT:
                    self._impl = _StdoutPrintingStreamReaderThroughCommandRouter(reader)
                else:
                    self._impl = reader

    @property
    def file_descriptor(self) -> int:
        """Possible values are `1` for stdout and `2` for stderr."""
        return self._impl.file_descriptor

    async def read(self) -> T:
        """Fetch the entire contents of the stream until EOF."""
        return cast(T, await self._impl.read())

    def __aiter__(self) -> AsyncGenerator[T, None]:
        if not self._read_gen:
            self._read_gen = cast(AsyncGenerator[T, None], self._impl.__aiter__())
        return self._read_gen

    async def __anext__(self) -> T:
        """Deprecated: This exists for backwards compatibility and will be removed in a future version of Modal

        Only use next/anext on the return value of iter/aiter on the StreamReader object (treat streamreader as
        an iterable, not an iterator).
        """
        if not self._read_gen:
            self.__aiter__()  # initialize the read generator
        assert self._read_gen
        return await self._read_gen.__anext__()

    async def aclose(self):
        """mdmd:hidden"""
        if self._read_gen:
            await self._read_gen.aclose()
            self._read_gen = None


MAX_BUFFER_SIZE = 2 * 1024 * 1024


class _StreamWriterThroughServer:
    """Provides an interface to buffer and write logs to a sandbox or container process stream (`stdin`)."""

    def __init__(self, object_id: str, object_type: Literal["sandbox", "container_process"], client: _Client) -> None:
        """mdmd:hidden"""
        self._index = 1
        self._object_id = object_id
        self._object_type = object_type
        self._client = client
        self._is_closed = False
        self._buffer = bytearray()

    def _get_next_index(self) -> int:
        index = self._index
        self._index += 1
        return index

    def write(self, data: Union[bytes, bytearray, memoryview, str]) -> None:
        """Write data to the stream but does not send it immediately.

        This is non-blocking and queues the data to an internal buffer. Must be
        used along with the `drain()` method, which flushes the buffer.
        """
        if self._is_closed:
            raise ValueError("Stdin is closed. Cannot write to it.")
        if isinstance(data, (bytes, bytearray, memoryview, str)):
            if isinstance(data, str):
                data = data.encode("utf-8")
            if len(self._buffer) + len(data) > MAX_BUFFER_SIZE:
                raise BufferError("Buffer size exceed limit. Call drain to flush the buffer.")
            self._buffer.extend(data)
        else:
            raise TypeError(f"data argument must be a bytes-like object, not {type(data).__name__}")

    def write_eof(self) -> None:
        """Close the write end of the stream after the buffered data is drained.

        If the process was blocked on input, it will become unblocked after
        `write_eof()`. This method needs to be used along with the `drain()`
        method, which flushes the EOF to the process.
        """
        self._is_closed = True

    async def drain(self) -> None:
        """Flush the write buffer and send data to the running process.

        This is a flow control method that blocks until data is sent. It returns
        when it is appropriate to continue writing data to the stream.
        """
        data = bytes(self._buffer)
        self._buffer.clear()
        index = self._get_next_index()

        try:
            if self._object_type == "sandbox":
                await self._client.stub.SandboxStdinWrite(
                    api_pb2.SandboxStdinWriteRequest(
                        sandbox_id=self._object_id, index=index, eof=self._is_closed, input=data
                    ),
                )
            else:
                await self._client.stub.ContainerExecPutInput(
                    api_pb2.ContainerExecPutInputRequest(
                        exec_id=self._object_id,
                        input=api_pb2.RuntimeInputMessage(message=data, message_index=index, eof=self._is_closed),
                    ),
                )
        except ConflictError as exc:
            raise ValueError(str(exc))


class _StreamWriterThroughCommandRouter:
    def __init__(
        self,
        object_id: str,
        command_router_client: TaskCommandRouterClient,
        task_id: str,
    ) -> None:
        self._object_id = object_id
        self._command_router_client = command_router_client
        self._task_id = task_id
        self._is_closed = False
        self._buffer = bytearray()
        self._offset = 0

    def write(self, data: Union[bytes, bytearray, memoryview, str]) -> None:
        if self._is_closed:
            raise ValueError("Stdin is closed. Cannot write to it.")
        if isinstance(data, (bytes, bytearray, memoryview, str)):
            if isinstance(data, str):
                data = data.encode("utf-8")
            if len(self._buffer) + len(data) > MAX_BUFFER_SIZE:
                raise BufferError("Buffer size exceed limit. Call drain to flush the buffer.")
            self._buffer.extend(data)
        else:
            raise TypeError(f"data argument must be a bytes-like object, not {type(data).__name__}")

    def write_eof(self) -> None:
        self._is_closed = True

    async def drain(self) -> None:
        eof = self._is_closed
        # NB: There's no need to prevent writing eof twice, because the command router will ignore the second EOF.
        if self._buffer or eof:
            data = bytes(self._buffer)
            await self._command_router_client.exec_stdin_write(
                task_id=self._task_id, exec_id=self._object_id, offset=self._offset, data=data, eof=eof
            )
            # Only clear the buffer after writing the data to the command router is successful.
            # This allows the client to retry drain() in the event of an exception (though
            # exec_stdin_write already retries on transient errors, so most users will probably
            # not do this).
            self._buffer.clear()
            self._offset += len(data)


class _StreamWriter:
    """Provides an interface to buffer and write logs to a sandbox or container process stream (`stdin`)."""

    def __init__(
        self,
        object_id: str,
        object_type: Literal["sandbox", "container_process"],
        client: _Client,
        command_router_client: Optional[TaskCommandRouterClient] = None,
        task_id: Optional[str] = None,
    ) -> None:
        """mdmd:hidden"""
        if command_router_client is None:
            self._impl = _StreamWriterThroughServer(object_id, object_type, client)
        else:
            assert task_id is not None
            assert object_type == "container_process"
            self._impl = _StreamWriterThroughCommandRouter(object_id, command_router_client, task_id=task_id)

    def write(self, data: Union[bytes, bytearray, memoryview, str]) -> None:
        """Write data to the stream but does not send it immediately.

        This is non-blocking and queues the data to an internal buffer. Must be
        used along with the `drain()` method, which flushes the buffer.

        **Usage**

        ```python fixture:sandbox
        proc = sandbox.exec(
            "bash",
            "-c",
            "while read line; do echo $line; done",
        )
        proc.stdin.write(b"foo\\n")
        proc.stdin.write(b"bar\\n")
        proc.stdin.write_eof()
        proc.stdin.drain()
        ```
        """
        self._impl.write(data)

    def write_eof(self) -> None:
        """Close the write end of the stream after the buffered data is drained.

        If the process was blocked on input, it will become unblocked after
        `write_eof()`. This method needs to be used along with the `drain()`
        method, which flushes the EOF to the process.
        """
        self._impl.write_eof()

    async def drain(self) -> None:
        """Flush the write buffer and send data to the running process.

        This is a flow control method that blocks until data is sent. It returns
        when it is appropriate to continue writing data to the stream.

        **Usage**

        ```python notest
        writer.write(data)
        writer.drain()
        ```

        Async usage:
        ```python notest
        writer.write(data)  # not a blocking operation
        await writer.drain.aio()
        ```
        """
        await self._impl.drain()


StreamReader = synchronize_api(_StreamReader)
StreamWriter = synchronize_api(_StreamWriter)
