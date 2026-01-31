# Copyright Modal Labs 2024
import asyncio
import platform
import time
from typing import Generic, Optional, TypeVar

from modal_proto import api_pb2

from ._utils.async_utils import TaskContext, synchronize_api
from ._utils.shell_utils import stream_from_stdin, write_to_fd
from ._utils.task_command_router_client import TaskCommandRouterClient
from .client import _Client
from .config import logger
from .exception import ExecTimeoutError, InteractiveTimeoutError, InvalidError
from .io_streams import _StreamReader, _StreamWriter
from .stream_type import StreamType

T = TypeVar("T", str, bytes)


class _ContainerProcessThroughServer(Generic[T]):
    _process_id: Optional[str] = None
    _stdout: _StreamReader[T]
    _stderr: _StreamReader[T]
    _stdin: _StreamWriter
    _exec_deadline: Optional[float] = None
    _text: bool
    _by_line: bool
    _returncode: Optional[int] = None

    def __init__(
        self,
        process_id: str,
        task_id: str,
        client: _Client,
        stdout: StreamType = StreamType.PIPE,
        stderr: StreamType = StreamType.PIPE,
        exec_deadline: Optional[float] = None,
        text: bool = True,
        by_line: bool = False,
    ) -> None:
        self._process_id = process_id
        self._client = client
        self._exec_deadline = exec_deadline
        self._text = text
        self._by_line = by_line
        self._stdout = _StreamReader[T](
            api_pb2.FILE_DESCRIPTOR_STDOUT,
            process_id,
            "container_process",
            self._client,
            stream_type=stdout,
            text=text,
            by_line=by_line,
            deadline=exec_deadline,
            task_id=task_id,
        )
        self._stderr = _StreamReader[T](
            api_pb2.FILE_DESCRIPTOR_STDERR,
            process_id,
            "container_process",
            self._client,
            stream_type=stderr,
            text=text,
            by_line=by_line,
            deadline=exec_deadline,
            task_id=task_id,
        )
        self._stdin = _StreamWriter(process_id, "container_process", self._client)

    def __repr__(self) -> str:
        return f"ContainerProcess(process_id={self._process_id!r})"

    @property
    def stdout(self) -> _StreamReader[T]:
        """StreamReader for the container process's stdout stream."""
        return self._stdout

    @property
    def stderr(self) -> _StreamReader[T]:
        """StreamReader for the container process's stderr stream."""
        return self._stderr

    @property
    def stdin(self) -> _StreamWriter:
        """StreamWriter for the container process's stdin stream."""
        return self._stdin

    @property
    def returncode(self) -> int:
        if self._returncode is None:
            raise InvalidError(
                "You must call wait() before accessing the returncode. "
                "To poll for the status of a running process, use poll() instead."
            )
        return self._returncode

    async def poll(self) -> Optional[int]:
        """Check if the container process has finished running.

        Returns `None` if the process is still running, else returns the exit code.
        """
        assert self._process_id
        if self._returncode is not None:
            return self._returncode
        if self._exec_deadline and time.monotonic() >= self._exec_deadline:
            # TODO(matt): In the future, it would be nice to raise a ContainerExecTimeoutError to make it
            # clear to the user that their sandbox terminated due to a timeout
            self._returncode = -1
            return self._returncode

        req = api_pb2.ContainerExecWaitRequest(exec_id=self._process_id, timeout=0)
        resp = await self._client.stub.ContainerExecWait(req)

        if resp.completed:
            self._returncode = resp.exit_code
            return self._returncode

        return None

    async def _wait_for_completion(self) -> int:
        assert self._process_id
        while True:
            req = api_pb2.ContainerExecWaitRequest(exec_id=self._process_id, timeout=10)
            resp = await self._client.stub.ContainerExecWait(req)
            if resp.completed:
                return resp.exit_code

    async def wait(self) -> int:
        """Wait for the container process to finish running. Returns the exit code."""
        if self._returncode is not None:
            return self._returncode

        try:
            timeout = None
            if self._exec_deadline:
                timeout = self._exec_deadline - time.monotonic()
                if timeout <= 0:
                    raise TimeoutError()
            self._returncode = await asyncio.wait_for(self._wait_for_completion(), timeout=timeout)
        except (asyncio.TimeoutError, TimeoutError):
            self._returncode = -1
        logger.debug(f"ContainerProcess {self._process_id} wait completed with returncode {self._returncode}")
        return self._returncode

    async def attach(self):
        """mdmd:hidden"""
        if platform.system() == "Windows":
            print("interactive exec is not currently supported on Windows.")  # noqa: T201
            return

        from ._output import make_console

        console = make_console()

        connecting_status = console.status("Connecting...")
        connecting_status.start()
        on_connect = asyncio.Event()

        async def _write_to_fd_loop(stream: _StreamReader):
            # This is required to make modal shell to an existing task work,
            # since that uses ContainerExec RPCs directly, but this is hacky.
            #
            # TODO(saltzm): Once we use the new exec path for that use case, this code can all be removed.
            from .io_streams import _StreamReaderThroughServer

            assert isinstance(stream._impl, _StreamReaderThroughServer)
            stream_impl = stream._impl
            # Don't skip empty messages so we can detect when the process has booted.
            async for chunk in stream_impl._get_logs(skip_empty_messages=False):
                if not on_connect.is_set():
                    connecting_status.stop()
                    on_connect.set()

                await write_to_fd(stream.file_descriptor, chunk)

        async def _handle_input(data: bytes, message_index: int):
            self.stdin.write(data)
            await self.stdin.drain()

        async with TaskContext() as tc:
            stdout_task = tc.create_task(_write_to_fd_loop(self.stdout))
            stderr_task = tc.create_task(_write_to_fd_loop(self.stderr))

            try:
                # time out if we can't connect to the server fast enough
                await asyncio.wait_for(on_connect.wait(), timeout=60)

                async with stream_from_stdin(_handle_input, use_raw_terminal=True):
                    await stdout_task
                    await stderr_task

                # TODO: this doesn't work right now.
                # if exit_status != 0:
                #     raise ExecutionError(f"Process exited with status code {exit_status}")

            except (asyncio.TimeoutError, TimeoutError):
                connecting_status.stop()
                stdout_task.cancel()
                stderr_task.cancel()
                raise InteractiveTimeoutError("Failed to establish connection to container. Please try again.")


async def _iter_stream_as_bytes(stream: _StreamReader[T]):
    """Yield raw bytes from a StreamReader regardless of text mode/backend."""
    async for part in stream:
        if isinstance(part, str):
            yield part.encode("utf-8")
        else:
            yield part


class _ContainerProcessThroughCommandRouter(Generic[T]):
    """
    Container process implementation that works via direct communication with
    the Modal worker where the container is running.
    """

    def __init__(
        self,
        process_id: str,
        client: _Client,
        command_router_client: TaskCommandRouterClient,
        task_id: str,
        *,
        stdout: StreamType = StreamType.PIPE,
        stderr: StreamType = StreamType.PIPE,
        exec_deadline: Optional[float] = None,
        text: bool = True,
        by_line: bool = False,
    ) -> None:
        self._client = client
        self._command_router_client = command_router_client
        self._process_id = process_id
        self._exec_deadline = exec_deadline
        self._text = text
        self._by_line = by_line
        self._task_id = task_id
        self._stdout = _StreamReader[T](
            api_pb2.FILE_DESCRIPTOR_STDOUT,
            process_id,
            "container_process",
            self._client,
            stream_type=stdout,
            text=text,
            by_line=by_line,
            deadline=exec_deadline,
            command_router_client=self._command_router_client,
            task_id=self._task_id,
        )
        self._stderr = _StreamReader[T](
            api_pb2.FILE_DESCRIPTOR_STDERR,
            process_id,
            "container_process",
            self._client,
            stream_type=stderr,
            text=text,
            by_line=by_line,
            deadline=exec_deadline,
            command_router_client=self._command_router_client,
            task_id=self._task_id,
        )
        self._stdin = _StreamWriter(
            process_id,
            "container_process",
            self._client,
            command_router_client=self._command_router_client,
            task_id=self._task_id,
        )
        self._returncode = None

    def __repr__(self) -> str:
        return f"ContainerProcess(process_id={self._process_id!r})"

    @property
    def stdout(self) -> _StreamReader[T]:
        return self._stdout

    @property
    def stderr(self) -> _StreamReader[T]:
        return self._stderr

    @property
    def stdin(self) -> _StreamWriter:
        return self._stdin

    @property
    def returncode(self) -> int:
        if self._returncode is None:
            raise InvalidError(
                "You must call wait() before accessing the returncode. "
                "To poll for the status of a running process, use poll() instead."
            )
        return self._returncode

    async def poll(self) -> Optional[int]:
        if self._returncode is not None:
            return self._returncode
        try:
            resp = await self._command_router_client.exec_poll(self._task_id, self._process_id, self._exec_deadline)
            which = resp.WhichOneof("exit_status")
            if which is None:
                return None

            if which == "code":
                self._returncode = int(resp.code)
                return self._returncode
            elif which == "signal":
                self._returncode = 128 + int(resp.signal)
                return self._returncode
            else:
                logger.debug(f"ContainerProcess {self._process_id} exited with unexpected status: {which}")
                raise InvalidError("Unexpected exit status")
        except ExecTimeoutError:
            logger.debug(f"ContainerProcess poll for {self._process_id} did not complete within deadline")
            # TODO(saltzm): This is a weird API, but customers currently may rely on it. This
            # should probably raise an ExecTimeoutError instead.
            self._returncode = -1
            return self._returncode
        except Exception as e:
            # Re-raise non-transient errors or errors resulting from exceeding retries on transient errors.
            logger.warning(f"ContainerProcess poll for {self._process_id} failed: {e}")
            raise

    async def wait(self) -> int:
        if self._returncode is not None:
            return self._returncode

        try:
            resp = await self._command_router_client.exec_wait(self._task_id, self._process_id, self._exec_deadline)
            which = resp.WhichOneof("exit_status")
            if which == "code":
                self._returncode = int(resp.code)
            elif which == "signal":
                self._returncode = 128 + int(resp.signal)
            else:
                logger.debug(f"ContainerProcess {self._process_id} exited with unexpected status: {which}")
                self._returncode = -1
                raise InvalidError("Unexpected exit status")
        except ExecTimeoutError:
            logger.debug(f"ContainerProcess {self._process_id} did not complete within deadline")
            # TODO(saltzm): This is a weird API, but customers currently may rely on it. This
            # should be a ExecTimeoutError.
            self._returncode = -1

        return self._returncode

    async def attach(self):
        if platform.system() == "Windows":
            print("interactive exec is not currently supported on Windows.")  # noqa: T201
            return

        from ._output import make_console

        console = make_console()

        connecting_status = console.status("Connecting...")
        connecting_status.start()
        on_connect = asyncio.Event()

        async def _write_to_fd_loop(stream: _StreamReader[T]):
            async for chunk in _iter_stream_as_bytes(stream):
                if chunk is None:
                    break

                if not on_connect.is_set():
                    connecting_status.stop()
                    on_connect.set()

                await write_to_fd(stream.file_descriptor, chunk)

        async def _handle_input(data: bytes, message_index: int):
            self.stdin.write(data)
            await self.stdin.drain()

        async with TaskContext() as tc:
            stdout_task = tc.create_task(_write_to_fd_loop(self.stdout))
            stderr_task = tc.create_task(_write_to_fd_loop(self.stderr))

            try:
                # Time out if we can't connect fast enough.
                await asyncio.wait_for(on_connect.wait(), timeout=60)

                async with stream_from_stdin(_handle_input, use_raw_terminal=True):
                    await stdout_task
                    await stderr_task

            except (asyncio.TimeoutError, TimeoutError):
                connecting_status.stop()
                stdout_task.cancel()
                stderr_task.cancel()
                raise InteractiveTimeoutError("Failed to establish connection to container. Please try again.")


class _ContainerProcess(Generic[T]):
    """Represents a running process in a container."""

    def __init__(
        self,
        process_id: str,
        task_id: str,
        client: _Client,
        stdout: StreamType = StreamType.PIPE,
        stderr: StreamType = StreamType.PIPE,
        exec_deadline: Optional[float] = None,
        text: bool = True,
        by_line: bool = False,
        command_router_client: Optional[TaskCommandRouterClient] = None,
    ) -> None:
        if command_router_client is None:
            self._impl = _ContainerProcessThroughServer(
                process_id,
                task_id,
                client,
                stdout=stdout,
                stderr=stderr,
                exec_deadline=exec_deadline,
                text=text,
                by_line=by_line,
            )
        else:
            self._impl = _ContainerProcessThroughCommandRouter(
                process_id,
                client,
                command_router_client,
                task_id,
                stdout=stdout,
                stderr=stderr,
                exec_deadline=exec_deadline,
                text=text,
                by_line=by_line,
            )

    def __repr__(self) -> str:
        return self._impl.__repr__()

    @property
    def stdout(self) -> _StreamReader[T]:
        """StreamReader for the container process's stdout stream."""
        return self._impl.stdout

    @property
    def stderr(self) -> _StreamReader[T]:
        """StreamReader for the container process's stderr stream."""
        return self._impl.stderr

    @property
    def stdin(self) -> _StreamWriter:
        """StreamWriter for the container process's stdin stream."""
        return self._impl.stdin

    @property
    def returncode(self) -> int:
        return self._impl.returncode

    async def poll(self) -> Optional[int]:
        """Check if the container process has finished running.

        Returns `None` if the process is still running, else returns the exit code.
        """
        return await self._impl.poll()

    async def wait(self) -> int:
        """Wait for the container process to finish running. Returns the exit code."""
        return await self._impl.wait()

    async def attach(self):
        """mdmd:hidden"""
        await self._impl.attach()


ContainerProcess = synchronize_api(_ContainerProcess)
