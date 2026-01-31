import _typeshed
import enum
import modal.client
import typing
import typing_extensions

T = typing.TypeVar("T")

async def _delete_bytes(file: _FileIO, start: typing.Optional[int] = None, end: typing.Optional[int] = None) -> None:
    """mdmd:hidden
    This method has been removed.
    """
    ...

async def _replace_bytes(
    file: _FileIO, data: bytes, start: typing.Optional[int] = None, end: typing.Optional[int] = None
) -> None:
    """mdmd:hidden
    This method has been removed.
    """
    ...

class FileWatchEventType(enum.Enum):
    Unknown = "Unknown"
    Access = "Access"
    Create = "Create"
    Modify = "Modify"
    Remove = "Remove"

class FileWatchEvent:
    """FileWatchEvent(paths: list[str], type: modal.file_io.FileWatchEventType)"""

    paths: list[str]
    type: FileWatchEventType

    def __init__(self, paths: list[str], type: FileWatchEventType) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __repr__(self):
        """Return repr(self)."""
        ...

    def __eq__(self, other):
        """Return self==value."""
        ...

class _FileIO(typing.Generic[T]):
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

    _task_id: str
    _file_descriptor: str
    _client: modal.client._Client
    _watch_output_buffer: list[typing.Union[bytes, None, Exception]]

    def __init__(self, client: modal.client._Client, task_id: str) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def _validate_mode(self, mode: str) -> None: ...
    def _consume_output(self, exec_id: str) -> typing.AsyncIterator[typing.Union[bytes, None, Exception]]: ...
    async def _consume_watch_output(self, exec_id: str) -> None: ...
    async def _parse_watch_output(self, event: bytes) -> typing.Optional[FileWatchEvent]: ...
    async def _wait(self, exec_id: str) -> bytes: ...
    def _validate_type(self, data: typing.Union[bytes, str]) -> None: ...
    async def _open_file(self, path: str, mode: str) -> None: ...
    @classmethod
    async def create(
        cls,
        path: str,
        mode: typing.Union[_typeshed.OpenTextMode, _typeshed.OpenBinaryMode],
        client: modal.client._Client,
        task_id: str,
    ) -> _FileIO:
        """Create a new FileIO handle."""
        ...

    async def _make_read_request(self, n: typing.Optional[int]) -> bytes: ...
    async def read(self, n: typing.Optional[int] = None) -> T:
        """Read n bytes from the current position, or the entire remaining file if n is None."""
        ...

    async def readline(self) -> T:
        """Read a single line from the current position."""
        ...

    async def readlines(self) -> typing.Sequence[T]:
        """Read all lines from the current position."""
        ...

    async def write(self, data: typing.Union[bytes, str]) -> None:
        """Write data to the current position.

        Writes may not appear until the entire buffer is flushed, which
        can be done manually with `flush()` or automatically when the file is
        closed.
        """
        ...

    async def flush(self) -> None:
        """Flush the buffer to disk."""
        ...

    def _get_whence(self, whence: int): ...
    async def seek(self, offset: int, whence: int = 0) -> None:
        """Move to a new position in the file.

        `whence` defaults to 0 (absolute file positioning); other values are 1
        (relative to the current position) and 2 (relative to the file's end).
        """
        ...

    @classmethod
    async def ls(cls, path: str, client: modal.client._Client, task_id: str) -> list[str]:
        """List the contents of the provided directory."""
        ...

    @classmethod
    async def mkdir(cls, path: str, client: modal.client._Client, task_id: str, parents: bool = False) -> None:
        """Create a new directory."""
        ...

    @classmethod
    async def rm(cls, path: str, client: modal.client._Client, task_id: str, recursive: bool = False) -> None:
        """Remove a file or directory in the Sandbox."""
        ...

    @classmethod
    def watch(
        cls,
        path: str,
        client: modal.client._Client,
        task_id: str,
        filter: typing.Optional[list[FileWatchEventType]] = None,
        recursive: bool = False,
        timeout: typing.Optional[int] = None,
    ) -> typing.AsyncIterator[FileWatchEvent]: ...
    async def _close(self) -> None: ...
    async def close(self) -> None:
        """Flush the buffer and close the file."""
        ...

    def _check_writable(self) -> None: ...
    def _check_readable(self) -> None: ...
    def _check_closed(self) -> None: ...
    async def __aenter__(self) -> _FileIO: ...
    async def __aexit__(self, exc_type, exc_value, traceback) -> None: ...

class __delete_bytes_spec(typing_extensions.Protocol):
    def __call__(self, /, file: FileIO, start: typing.Optional[int] = None, end: typing.Optional[int] = None) -> None:
        """mdmd:hidden
        This method has been removed.
        """
        ...

    async def aio(self, /, file: FileIO, start: typing.Optional[int] = None, end: typing.Optional[int] = None) -> None:
        """mdmd:hidden
        This method has been removed.
        """
        ...

delete_bytes: __delete_bytes_spec

class __replace_bytes_spec(typing_extensions.Protocol):
    def __call__(
        self, /, file: FileIO, data: bytes, start: typing.Optional[int] = None, end: typing.Optional[int] = None
    ) -> None:
        """mdmd:hidden
        This method has been removed.
        """
        ...

    async def aio(
        self, /, file: FileIO, data: bytes, start: typing.Optional[int] = None, end: typing.Optional[int] = None
    ) -> None:
        """mdmd:hidden
        This method has been removed.
        """
        ...

replace_bytes: __replace_bytes_spec

T_INNER = typing.TypeVar("T_INNER", covariant=True)

class FileIO(typing.Generic[T]):
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

    _task_id: str
    _file_descriptor: str
    _client: modal.client.Client
    _watch_output_buffer: list[typing.Union[bytes, None, Exception]]

    def __init__(self, client: modal.client.Client, task_id: str) -> None: ...
    def _validate_mode(self, mode: str) -> None: ...

    class ___consume_output_spec(typing_extensions.Protocol):
        def __call__(self, /, exec_id: str) -> typing.Iterator[typing.Union[bytes, None, Exception]]: ...
        def aio(self, /, exec_id: str) -> typing.AsyncIterator[typing.Union[bytes, None, Exception]]: ...

    _consume_output: ___consume_output_spec

    class ___consume_watch_output_spec(typing_extensions.Protocol):
        def __call__(self, /, exec_id: str) -> None: ...
        async def aio(self, /, exec_id: str) -> None: ...

    _consume_watch_output: ___consume_watch_output_spec

    class ___parse_watch_output_spec(typing_extensions.Protocol):
        def __call__(self, /, event: bytes) -> typing.Optional[FileWatchEvent]: ...
        async def aio(self, /, event: bytes) -> typing.Optional[FileWatchEvent]: ...

    _parse_watch_output: ___parse_watch_output_spec

    class ___wait_spec(typing_extensions.Protocol):
        def __call__(self, /, exec_id: str) -> bytes: ...
        async def aio(self, /, exec_id: str) -> bytes: ...

    _wait: ___wait_spec

    def _validate_type(self, data: typing.Union[bytes, str]) -> None: ...

    class ___open_file_spec(typing_extensions.Protocol):
        def __call__(self, /, path: str, mode: str) -> None: ...
        async def aio(self, /, path: str, mode: str) -> None: ...

    _open_file: ___open_file_spec

    class __create_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            path: str,
            mode: typing.Union[_typeshed.OpenTextMode, _typeshed.OpenBinaryMode],
            client: modal.client.Client,
            task_id: str,
        ) -> FileIO:
            """Create a new FileIO handle."""
            ...

        async def aio(
            self,
            /,
            path: str,
            mode: typing.Union[_typeshed.OpenTextMode, _typeshed.OpenBinaryMode],
            client: modal.client.Client,
            task_id: str,
        ) -> FileIO:
            """Create a new FileIO handle."""
            ...

    create: typing.ClassVar[__create_spec]

    class ___make_read_request_spec(typing_extensions.Protocol):
        def __call__(self, /, n: typing.Optional[int]) -> bytes: ...
        async def aio(self, /, n: typing.Optional[int]) -> bytes: ...

    _make_read_request: ___make_read_request_spec

    class __read_spec(typing_extensions.Protocol[T_INNER]):
        def __call__(self, /, n: typing.Optional[int] = None) -> T_INNER:
            """Read n bytes from the current position, or the entire remaining file if n is None."""
            ...

        async def aio(self, /, n: typing.Optional[int] = None) -> T_INNER:
            """Read n bytes from the current position, or the entire remaining file if n is None."""
            ...

    read: __read_spec[T]

    class __readline_spec(typing_extensions.Protocol[T_INNER]):
        def __call__(self, /) -> T_INNER:
            """Read a single line from the current position."""
            ...

        async def aio(self, /) -> T_INNER:
            """Read a single line from the current position."""
            ...

    readline: __readline_spec[T]

    class __readlines_spec(typing_extensions.Protocol[T_INNER]):
        def __call__(self, /) -> typing.Sequence[T_INNER]:
            """Read all lines from the current position."""
            ...

        async def aio(self, /) -> typing.Sequence[T_INNER]:
            """Read all lines from the current position."""
            ...

    readlines: __readlines_spec[T]

    class __write_spec(typing_extensions.Protocol):
        def __call__(self, /, data: typing.Union[bytes, str]) -> None:
            """Write data to the current position.

            Writes may not appear until the entire buffer is flushed, which
            can be done manually with `flush()` or automatically when the file is
            closed.
            """
            ...

        async def aio(self, /, data: typing.Union[bytes, str]) -> None:
            """Write data to the current position.

            Writes may not appear until the entire buffer is flushed, which
            can be done manually with `flush()` or automatically when the file is
            closed.
            """
            ...

    write: __write_spec

    class __flush_spec(typing_extensions.Protocol):
        def __call__(self, /) -> None:
            """Flush the buffer to disk."""
            ...

        async def aio(self, /) -> None:
            """Flush the buffer to disk."""
            ...

    flush: __flush_spec

    def _get_whence(self, whence: int): ...

    class __seek_spec(typing_extensions.Protocol):
        def __call__(self, /, offset: int, whence: int = 0) -> None:
            """Move to a new position in the file.

            `whence` defaults to 0 (absolute file positioning); other values are 1
            (relative to the current position) and 2 (relative to the file's end).
            """
            ...

        async def aio(self, /, offset: int, whence: int = 0) -> None:
            """Move to a new position in the file.

            `whence` defaults to 0 (absolute file positioning); other values are 1
            (relative to the current position) and 2 (relative to the file's end).
            """
            ...

    seek: __seek_spec

    class __ls_spec(typing_extensions.Protocol):
        def __call__(self, /, path: str, client: modal.client.Client, task_id: str) -> list[str]:
            """List the contents of the provided directory."""
            ...

        async def aio(self, /, path: str, client: modal.client.Client, task_id: str) -> list[str]:
            """List the contents of the provided directory."""
            ...

    ls: typing.ClassVar[__ls_spec]

    class __mkdir_spec(typing_extensions.Protocol):
        def __call__(self, /, path: str, client: modal.client.Client, task_id: str, parents: bool = False) -> None:
            """Create a new directory."""
            ...

        async def aio(self, /, path: str, client: modal.client.Client, task_id: str, parents: bool = False) -> None:
            """Create a new directory."""
            ...

    mkdir: typing.ClassVar[__mkdir_spec]

    class __rm_spec(typing_extensions.Protocol):
        def __call__(self, /, path: str, client: modal.client.Client, task_id: str, recursive: bool = False) -> None:
            """Remove a file or directory in the Sandbox."""
            ...

        async def aio(self, /, path: str, client: modal.client.Client, task_id: str, recursive: bool = False) -> None:
            """Remove a file or directory in the Sandbox."""
            ...

    rm: typing.ClassVar[__rm_spec]

    class __watch_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            path: str,
            client: modal.client.Client,
            task_id: str,
            filter: typing.Optional[list[FileWatchEventType]] = None,
            recursive: bool = False,
            timeout: typing.Optional[int] = None,
        ) -> typing.Iterator[FileWatchEvent]: ...
        def aio(
            self,
            /,
            path: str,
            client: modal.client.Client,
            task_id: str,
            filter: typing.Optional[list[FileWatchEventType]] = None,
            recursive: bool = False,
            timeout: typing.Optional[int] = None,
        ) -> typing.AsyncIterator[FileWatchEvent]: ...

    watch: typing.ClassVar[__watch_spec]

    class ___close_spec(typing_extensions.Protocol):
        def __call__(self, /) -> None: ...
        async def aio(self, /) -> None: ...

    _close: ___close_spec

    class __close_spec(typing_extensions.Protocol):
        def __call__(self, /) -> None:
            """Flush the buffer and close the file."""
            ...

        async def aio(self, /) -> None:
            """Flush the buffer and close the file."""
            ...

    close: __close_spec

    def _check_writable(self) -> None: ...
    def _check_readable(self) -> None: ...
    def _check_closed(self) -> None: ...
    def __enter__(self) -> FileIO: ...
    async def __aenter__(self) -> FileIO: ...
    def __exit__(self, exc_type, exc_value, traceback) -> None: ...
    async def __aexit__(self, exc_type, exc_value, traceback) -> None: ...
