import modal._utils.task_command_router_client
import modal.client
import modal.io_streams
import modal.stream_type
import typing
import typing_extensions

T = typing.TypeVar("T")

class _ContainerProcessThroughServer(typing.Generic[T]):
    """Abstract base class for generic types.

    A generic type is typically declared by inheriting from
    this class parameterized with one or more type variables.
    For example, a generic mapping type might be defined as::

      class Mapping(Generic[KT, VT]):
          def __getitem__(self, key: KT) -> VT:
              ...
          # Etc.

    This class can then be used as follows::

      def lookup_name(mapping: Mapping[KT, VT], key: KT, default: VT) -> VT:
          try:
              return mapping[key]
          except KeyError:
              return default
    """

    _process_id: typing.Optional[str]
    _stdout: modal.io_streams._StreamReader[T]
    _stderr: modal.io_streams._StreamReader[T]
    _stdin: modal.io_streams._StreamWriter
    _exec_deadline: typing.Optional[float]
    _text: bool
    _by_line: bool
    _returncode: typing.Optional[int]

    def __init__(
        self,
        process_id: str,
        task_id: str,
        client: modal.client._Client,
        stdout: modal.stream_type.StreamType = modal.stream_type.StreamType.PIPE,
        stderr: modal.stream_type.StreamType = modal.stream_type.StreamType.PIPE,
        exec_deadline: typing.Optional[float] = None,
        text: bool = True,
        by_line: bool = False,
    ) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __repr__(self) -> str:
        """Return repr(self)."""
        ...

    @property
    def stdout(self) -> modal.io_streams._StreamReader[T]:
        """StreamReader for the container process's stdout stream."""
        ...

    @property
    def stderr(self) -> modal.io_streams._StreamReader[T]:
        """StreamReader for the container process's stderr stream."""
        ...

    @property
    def stdin(self) -> modal.io_streams._StreamWriter:
        """StreamWriter for the container process's stdin stream."""
        ...

    @property
    def returncode(self) -> int: ...
    async def poll(self) -> typing.Optional[int]:
        """Check if the container process has finished running.

        Returns `None` if the process is still running, else returns the exit code.
        """
        ...

    async def _wait_for_completion(self) -> int: ...
    async def wait(self) -> int:
        """Wait for the container process to finish running. Returns the exit code."""
        ...

    async def attach(self):
        """mdmd:hidden"""
        ...

def _iter_stream_as_bytes(stream: modal.io_streams._StreamReader[T]):
    """Yield raw bytes from a StreamReader regardless of text mode/backend."""
    ...

class _ContainerProcessThroughCommandRouter(typing.Generic[T]):
    """Container process implementation that works via direct communication with
    the Modal worker where the container is running.
    """
    def __init__(
        self,
        process_id: str,
        client: modal.client._Client,
        command_router_client: modal._utils.task_command_router_client.TaskCommandRouterClient,
        task_id: str,
        *,
        stdout: modal.stream_type.StreamType = modal.stream_type.StreamType.PIPE,
        stderr: modal.stream_type.StreamType = modal.stream_type.StreamType.PIPE,
        exec_deadline: typing.Optional[float] = None,
        text: bool = True,
        by_line: bool = False,
    ) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __repr__(self) -> str:
        """Return repr(self)."""
        ...

    @property
    def stdout(self) -> modal.io_streams._StreamReader[T]: ...
    @property
    def stderr(self) -> modal.io_streams._StreamReader[T]: ...
    @property
    def stdin(self) -> modal.io_streams._StreamWriter: ...
    @property
    def returncode(self) -> int: ...
    async def poll(self) -> typing.Optional[int]: ...
    async def wait(self) -> int: ...
    async def attach(self): ...

class _ContainerProcess(typing.Generic[T]):
    """Represents a running process in a container."""
    def __init__(
        self,
        process_id: str,
        task_id: str,
        client: modal.client._Client,
        stdout: modal.stream_type.StreamType = modal.stream_type.StreamType.PIPE,
        stderr: modal.stream_type.StreamType = modal.stream_type.StreamType.PIPE,
        exec_deadline: typing.Optional[float] = None,
        text: bool = True,
        by_line: bool = False,
        command_router_client: typing.Optional[modal._utils.task_command_router_client.TaskCommandRouterClient] = None,
    ) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __repr__(self) -> str:
        """Return repr(self)."""
        ...

    @property
    def stdout(self) -> modal.io_streams._StreamReader[T]:
        """StreamReader for the container process's stdout stream."""
        ...

    @property
    def stderr(self) -> modal.io_streams._StreamReader[T]:
        """StreamReader for the container process's stderr stream."""
        ...

    @property
    def stdin(self) -> modal.io_streams._StreamWriter:
        """StreamWriter for the container process's stdin stream."""
        ...

    @property
    def returncode(self) -> int: ...
    async def poll(self) -> typing.Optional[int]:
        """Check if the container process has finished running.

        Returns `None` if the process is still running, else returns the exit code.
        """
        ...

    async def wait(self) -> int:
        """Wait for the container process to finish running. Returns the exit code."""
        ...

    async def attach(self):
        """mdmd:hidden"""
        ...

class ContainerProcess(typing.Generic[T]):
    """Represents a running process in a container."""
    def __init__(
        self,
        process_id: str,
        task_id: str,
        client: modal.client.Client,
        stdout: modal.stream_type.StreamType = modal.stream_type.StreamType.PIPE,
        stderr: modal.stream_type.StreamType = modal.stream_type.StreamType.PIPE,
        exec_deadline: typing.Optional[float] = None,
        text: bool = True,
        by_line: bool = False,
        command_router_client: typing.Optional[modal._utils.task_command_router_client.TaskCommandRouterClient] = None,
    ) -> None: ...
    def __repr__(self) -> str: ...
    @property
    def stdout(self) -> modal.io_streams.StreamReader[T]:
        """StreamReader for the container process's stdout stream."""
        ...

    @property
    def stderr(self) -> modal.io_streams.StreamReader[T]:
        """StreamReader for the container process's stderr stream."""
        ...

    @property
    def stdin(self) -> modal.io_streams.StreamWriter:
        """StreamWriter for the container process's stdin stream."""
        ...

    @property
    def returncode(self) -> int: ...

    class __poll_spec(typing_extensions.Protocol):
        def __call__(self, /) -> typing.Optional[int]:
            """Check if the container process has finished running.

            Returns `None` if the process is still running, else returns the exit code.
            """
            ...

        async def aio(self, /) -> typing.Optional[int]:
            """Check if the container process has finished running.

            Returns `None` if the process is still running, else returns the exit code.
            """
            ...

    poll: __poll_spec

    class __wait_spec(typing_extensions.Protocol):
        def __call__(self, /) -> int:
            """Wait for the container process to finish running. Returns the exit code."""
            ...

        async def aio(self, /) -> int:
            """Wait for the container process to finish running. Returns the exit code."""
            ...

    wait: __wait_spec

    class __attach_spec(typing_extensions.Protocol):
        def __call__(self, /):
            """mdmd:hidden"""
            ...

        async def aio(self, /):
            """mdmd:hidden"""
            ...

    attach: __attach_spec
