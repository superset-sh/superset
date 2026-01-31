# Copyright Modal Labs 2024
import asyncio
import enum
import io
from dataclasses import dataclass
from typing import TYPE_CHECKING, AsyncIterator, Generic, Optional, Sequence, TypeVar, Union, cast

if TYPE_CHECKING:
    import _typeshed

import json

from grpclib.exceptions import StreamTerminatedError

from modal._utils.async_utils import TaskContext
from modal.exception import ClientClosed
from modal_proto import api_pb2

from ._utils.async_utils import synchronize_api
from ._utils.deprecation import deprecation_error
from .client import _Client
from .exception import FilesystemExecutionError, InternalError, ServiceError

WRITE_CHUNK_SIZE = 16 * 1024 * 1024  # 16 MiB
WRITE_FILE_SIZE_LIMIT = 1024 * 1024 * 1024  # 1 GiB
READ_FILE_SIZE_LIMIT = 100 * 1024 * 1024  # 100 MiB

ERROR_MAPPING = {
    api_pb2.SystemErrorCode.SYSTEM_ERROR_CODE_UNSPECIFIED: FilesystemExecutionError,
    api_pb2.SystemErrorCode.SYSTEM_ERROR_CODE_PERM: PermissionError,
    api_pb2.SystemErrorCode.SYSTEM_ERROR_CODE_NOENT: FileNotFoundError,
    api_pb2.SystemErrorCode.SYSTEM_ERROR_CODE_IO: IOError,
    api_pb2.SystemErrorCode.SYSTEM_ERROR_CODE_NXIO: IOError,
    api_pb2.SystemErrorCode.SYSTEM_ERROR_CODE_NOMEM: MemoryError,
    api_pb2.SystemErrorCode.SYSTEM_ERROR_CODE_ACCES: PermissionError,
    api_pb2.SystemErrorCode.SYSTEM_ERROR_CODE_EXIST: FileExistsError,
    api_pb2.SystemErrorCode.SYSTEM_ERROR_CODE_NOTDIR: NotADirectoryError,
    api_pb2.SystemErrorCode.SYSTEM_ERROR_CODE_ISDIR: IsADirectoryError,
    api_pb2.SystemErrorCode.SYSTEM_ERROR_CODE_INVAL: OSError,
    api_pb2.SystemErrorCode.SYSTEM_ERROR_CODE_MFILE: OSError,
    api_pb2.SystemErrorCode.SYSTEM_ERROR_CODE_FBIG: OSError,
    api_pb2.SystemErrorCode.SYSTEM_ERROR_CODE_NOSPC: OSError,
}

T = TypeVar("T", str, bytes)


async def _delete_bytes(file: "_FileIO", start: Optional[int] = None, end: Optional[int] = None) -> None:
    """mdmd:hidden
    This method has been removed.
    """
    deprecation_error((2025, 12, 3), "delete_bytes has been removed.")


async def _replace_bytes(file: "_FileIO", data: bytes, start: Optional[int] = None, end: Optional[int] = None) -> None:
    """mdmd:hidden
    This method has been removed.
    """
    deprecation_error((2025, 12, 3), "replace_bytes has been removed.")


class FileWatchEventType(enum.Enum):
    Unknown = "Unknown"
    Access = "Access"
    Create = "Create"
    Modify = "Modify"
    Remove = "Remove"


@dataclass
class FileWatchEvent:
    paths: list[str]
    type: FileWatchEventType


# The FileIO class is designed to mimic Python's io.FileIO
# See https://github.com/python/cpython/blob/main/Lib/_pyio.py#L1459
class _FileIO(Generic[T]):
    """[Alpha] FileIO handle, used in the Sandbox filesystem API.

    The API is designed to mimic Python's io.FileIO.

    Currently this API is in Alpha and is subject to change. File I/O operations
    may be limited in size to 100 MiB, and the throughput of requests is
    restricted in the current implementation. For our recommendations on large file transfers
    see the Sandbox [filesystem access guide](https://modal.com/docs/guide/sandbox-files).

    **Usage**

    ```python notest
    import modal

    app = modal.App.lookup("my-app", create_if_missing=True)

    sb = modal.Sandbox.create(app=app)
    f = sb.open("/tmp/foo.txt", "w")
    f.write("hello")
    f.close()
    ```
    """

    _binary = False
    _readable = False
    _writable = False
    _appended = False
    _closed = True

    _task_id: str = ""
    _file_descriptor: str = ""
    _client: _Client
    _watch_output_buffer: list[Union[Optional[bytes], Exception]] = []

    def __init__(self, client: _Client, task_id: str) -> None:
        self._client = client
        self._task_id = task_id
        self._watch_output_buffer = []

    def _validate_mode(self, mode: str) -> None:
        if not any(char in mode for char in "rwax"):
            raise ValueError(f"Invalid file mode: {mode}")

        self._readable = "r" in mode or "+" in mode
        self._writable = "w" in mode or "a" in mode or "x" in mode or "+" in mode
        self._appended = "a" in mode
        self._binary = "b" in mode

        valid_chars = set("rwaxb+")
        if any(char not in valid_chars for char in mode):
            raise ValueError(f"Invalid file mode: {mode}")

        mode_count = sum(1 for c in mode if c in "rwax")
        if mode_count > 1:
            raise ValueError("must have exactly one of create/read/write/append mode")

        seen_chars = set()
        for char in mode:
            if char in seen_chars:
                raise ValueError(f"Invalid file mode: {mode}")
            seen_chars.add(char)

    async def _consume_output(self, exec_id: str) -> AsyncIterator[Union[Optional[bytes], Exception]]:
        req = api_pb2.ContainerFilesystemExecGetOutputRequest(
            exec_id=exec_id,
            timeout=55,
        )
        async for batch in self._client.stub.ContainerFilesystemExecGetOutput.unary_stream(req):
            if batch.eof:
                yield None
                break
            if batch.HasField("error"):
                error_class = ERROR_MAPPING.get(batch.error.error_code, FilesystemExecutionError)
                yield error_class(batch.error.error_message)
            for message in batch.output:
                yield message

    async def _consume_watch_output(self, exec_id: str) -> None:
        completed = False
        retries_remaining = 10
        while not completed:
            try:
                iterator = self._consume_output(exec_id)
                async for message in iterator:
                    self._watch_output_buffer.append(message)
                    if message is None:
                        completed = True
                        break

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
                raise exc

    async def _parse_watch_output(self, event: bytes) -> Optional[FileWatchEvent]:
        try:
            event_json = json.loads(event.decode())
            return FileWatchEvent(type=FileWatchEventType(event_json["event_type"]), paths=event_json["paths"])
        except (json.JSONDecodeError, KeyError, ValueError):
            # skip invalid events
            return None

    async def _wait(self, exec_id: str) -> bytes:
        # The logic here is similar to how output is read from `exec`
        output_buffer = io.BytesIO()
        completed = False
        retries_remaining = 10
        while not completed:
            try:
                async for data in self._consume_output(exec_id):
                    if data is None:
                        completed = True
                        break
                    if isinstance(data, Exception):
                        raise data
                    output_buffer.write(data)
            except (ServiceError, InternalError, StreamTerminatedError) as exc:
                if retries_remaining > 0:
                    retries_remaining -= 1
                    if isinstance(exc, (ServiceError, InternalError)):
                        await asyncio.sleep(1.0)
                        continue
                    elif isinstance(exc, StreamTerminatedError):
                        continue
                raise
        return output_buffer.getvalue()

    def _validate_type(self, data: Union[bytes, str]) -> None:
        if self._binary and isinstance(data, str):
            raise TypeError("Expected bytes when in binary mode")
        if not self._binary and isinstance(data, bytes):
            raise TypeError("Expected str when in text mode")

    async def _open_file(self, path: str, mode: str) -> None:
        resp = await self._client.stub.ContainerFilesystemExec(
            api_pb2.ContainerFilesystemExecRequest(
                file_open_request=api_pb2.ContainerFileOpenRequest(path=path, mode=mode),
                task_id=self._task_id,
            ),
        )
        if not resp.HasField("file_descriptor"):
            raise FilesystemExecutionError("Failed to open file")
        self._file_descriptor = resp.file_descriptor
        await self._wait(resp.exec_id)

    @classmethod
    async def create(
        cls, path: str, mode: Union["_typeshed.OpenTextMode", "_typeshed.OpenBinaryMode"], client: _Client, task_id: str
    ) -> "_FileIO":
        """Create a new FileIO handle."""
        self = _FileIO(client, task_id)
        self._validate_mode(mode)
        await self._open_file(path, mode)
        self._closed = False
        return self

    async def _make_read_request(self, n: Optional[int]) -> bytes:
        resp = await self._client.stub.ContainerFilesystemExec(
            api_pb2.ContainerFilesystemExecRequest(
                file_read_request=api_pb2.ContainerFileReadRequest(file_descriptor=self._file_descriptor, n=n),
                task_id=self._task_id,
            ),
        )
        return await self._wait(resp.exec_id)

    async def read(self, n: Optional[int] = None) -> T:
        """Read n bytes from the current position, or the entire remaining file if n is None."""
        self._check_closed()
        self._check_readable()
        if n is not None and n > READ_FILE_SIZE_LIMIT:
            raise ValueError("Read request payload exceeds 100 MiB limit")
        output = await self._make_read_request(n)
        if self._binary:
            return cast(T, output)
        return cast(T, output.decode("utf-8"))

    async def readline(self) -> T:
        """Read a single line from the current position."""
        self._check_closed()
        self._check_readable()
        resp = await self._client.stub.ContainerFilesystemExec(
            api_pb2.ContainerFilesystemExecRequest(
                file_read_line_request=api_pb2.ContainerFileReadLineRequest(file_descriptor=self._file_descriptor),
                task_id=self._task_id,
            ),
        )
        output = await self._wait(resp.exec_id)
        if self._binary:
            return cast(T, output)
        return cast(T, output.decode("utf-8"))

    async def readlines(self) -> Sequence[T]:
        """Read all lines from the current position."""
        self._check_closed()
        self._check_readable()
        output = await self._make_read_request(None)
        if self._binary:
            lines_bytes = output.split(b"\n")
            return_bytes = [line + b"\n" for line in lines_bytes[:-1]] + ([lines_bytes[-1]] if lines_bytes[-1] else [])
            return cast(Sequence[T], return_bytes)
        else:
            lines = output.decode("utf-8").split("\n")
            return_strs = [line + "\n" for line in lines[:-1]] + ([lines[-1]] if lines[-1] else [])
            return cast(Sequence[T], return_strs)

    async def write(self, data: Union[bytes, str]) -> None:
        """Write data to the current position.

        Writes may not appear until the entire buffer is flushed, which
        can be done manually with `flush()` or automatically when the file is
        closed.
        """
        self._check_closed()
        self._check_writable()
        self._validate_type(data)
        if isinstance(data, str):
            data = data.encode("utf-8")
        if len(data) > WRITE_FILE_SIZE_LIMIT:
            raise ValueError("Write request payload exceeds 1 GiB limit")
        for i in range(0, len(data), WRITE_CHUNK_SIZE):
            chunk = data[i : i + WRITE_CHUNK_SIZE]
            resp = await self._client.stub.ContainerFilesystemExec(
                api_pb2.ContainerFilesystemExecRequest(
                    file_write_request=api_pb2.ContainerFileWriteRequest(
                        file_descriptor=self._file_descriptor,
                        data=chunk,
                    ),
                    task_id=self._task_id,
                ),
            )
            await self._wait(resp.exec_id)

    async def flush(self) -> None:
        """Flush the buffer to disk."""
        self._check_closed()
        self._check_writable()
        resp = await self._client.stub.ContainerFilesystemExec(
            api_pb2.ContainerFilesystemExecRequest(
                file_flush_request=api_pb2.ContainerFileFlushRequest(file_descriptor=self._file_descriptor),
                task_id=self._task_id,
            ),
        )
        await self._wait(resp.exec_id)

    def _get_whence(self, whence: int):
        if whence == 0:
            return api_pb2.SeekWhence.SEEK_SET
        elif whence == 1:
            return api_pb2.SeekWhence.SEEK_CUR
        elif whence == 2:
            return api_pb2.SeekWhence.SEEK_END
        else:
            raise ValueError(f"Invalid whence value: {whence}")

    async def seek(self, offset: int, whence: int = 0) -> None:
        """Move to a new position in the file.

        `whence` defaults to 0 (absolute file positioning); other values are 1
        (relative to the current position) and 2 (relative to the file's end).
        """
        self._check_closed()
        resp = await self._client.stub.ContainerFilesystemExec(
            api_pb2.ContainerFilesystemExecRequest(
                file_seek_request=api_pb2.ContainerFileSeekRequest(
                    file_descriptor=self._file_descriptor,
                    offset=offset,
                    whence=self._get_whence(whence),
                ),
                task_id=self._task_id,
            ),
        )
        await self._wait(resp.exec_id)

    @classmethod
    async def ls(cls, path: str, client: _Client, task_id: str) -> list[str]:
        """List the contents of the provided directory."""
        self = _FileIO(client, task_id)
        resp = await self._client.stub.ContainerFilesystemExec(
            api_pb2.ContainerFilesystemExecRequest(
                file_ls_request=api_pb2.ContainerFileLsRequest(path=path),
                task_id=task_id,
            ),
        )
        output = await self._wait(resp.exec_id)
        try:
            return json.loads(output.decode("utf-8"))["paths"]
        except json.JSONDecodeError:
            raise FilesystemExecutionError("failed to parse list output")

    @classmethod
    async def mkdir(cls, path: str, client: _Client, task_id: str, parents: bool = False) -> None:
        """Create a new directory."""
        self = _FileIO(client, task_id)
        resp = await self._client.stub.ContainerFilesystemExec(
            api_pb2.ContainerFilesystemExecRequest(
                file_mkdir_request=api_pb2.ContainerFileMkdirRequest(path=path, make_parents=parents),
                task_id=self._task_id,
            ),
        )
        await self._wait(resp.exec_id)

    @classmethod
    async def rm(cls, path: str, client: _Client, task_id: str, recursive: bool = False) -> None:
        """Remove a file or directory in the Sandbox."""
        self = _FileIO(client, task_id)
        resp = await self._client.stub.ContainerFilesystemExec(
            api_pb2.ContainerFilesystemExecRequest(
                file_rm_request=api_pb2.ContainerFileRmRequest(path=path, recursive=recursive),
                task_id=self._task_id,
            ),
        )
        await self._wait(resp.exec_id)

    @classmethod
    async def watch(
        cls,
        path: str,
        client: _Client,
        task_id: str,
        filter: Optional[list[FileWatchEventType]] = None,
        recursive: bool = False,
        timeout: Optional[int] = None,
    ) -> AsyncIterator[FileWatchEvent]:
        self = _FileIO(client, task_id)
        resp = await self._client.stub.ContainerFilesystemExec(
            api_pb2.ContainerFilesystemExecRequest(
                file_watch_request=api_pb2.ContainerFileWatchRequest(
                    path=path,
                    recursive=recursive,
                    timeout_secs=timeout,
                ),
                task_id=self._task_id,
            ),
        )

        def end_of_event(item: bytes, buffer: io.BytesIO, boundary_token: bytes) -> bool:
            if not item.endswith(b"\n"):
                return False
            boundary_token_size = len(boundary_token)
            if buffer.tell() < boundary_token_size:
                return False
            buffer.seek(-boundary_token_size, io.SEEK_END)
            if buffer.read(boundary_token_size) == boundary_token:
                return True
            return False

        async with TaskContext() as tc:
            tc.create_task(self._consume_watch_output(resp.exec_id))

            item_buffer = io.BytesIO()
            while True:
                if len(self._watch_output_buffer) > 0:
                    item = self._watch_output_buffer.pop(0)
                    if item is None:
                        break
                    if isinstance(item, Exception):
                        raise item
                    item_buffer.write(item)
                    assert isinstance(item, bytes)
                    # Single events may span multiple messages so we need to check for a special event boundary token
                    if end_of_event(item, item_buffer, boundary_token=b"\n\n"):
                        try:
                            event_json = json.loads(item_buffer.getvalue().strip().decode())
                            event = FileWatchEvent(
                                type=FileWatchEventType(event_json["event_type"]),
                                paths=event_json["paths"],
                            )
                            if not filter or event.type in filter:
                                yield event
                        except (json.JSONDecodeError, KeyError, ValueError):
                            # skip invalid events
                            pass
                        item_buffer = io.BytesIO()
                else:
                    await asyncio.sleep(0.1)

    async def _close(self) -> None:
        # Buffer is flushed by the runner on close
        resp = await self._client.stub.ContainerFilesystemExec(
            api_pb2.ContainerFilesystemExecRequest(
                file_close_request=api_pb2.ContainerFileCloseRequest(file_descriptor=self._file_descriptor),
                task_id=self._task_id,
            ),
        )
        self._closed = True
        await self._wait(resp.exec_id)

    async def close(self) -> None:
        """Flush the buffer and close the file."""
        await self._close()

    # also validated in the runner, but checked in the client to catch errors early
    def _check_writable(self) -> None:
        if not self._writable:
            raise io.UnsupportedOperation("not writeable")

    # also validated in the runner, but checked in the client to catch errors early
    def _check_readable(self) -> None:
        if not self._readable:
            raise io.UnsupportedOperation("not readable")

    # also validated in the runner, but checked in the client to catch errors early
    def _check_closed(self) -> None:
        if self._closed:
            raise ValueError("I/O operation on closed file")

    async def __aenter__(self) -> "_FileIO":
        return self

    async def __aexit__(self, exc_type, exc_value, traceback) -> None:
        await self._close()


delete_bytes = synchronize_api(_delete_bytes)
replace_bytes = synchronize_api(_replace_bytes)
FileIO = synchronize_api(_FileIO)
