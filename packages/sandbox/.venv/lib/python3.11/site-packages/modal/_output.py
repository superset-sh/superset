# Copyright Modal Labs 2022
from __future__ import annotations

import asyncio
import contextlib
import functools
import platform
import re
import socket
import sys
from collections.abc import Generator
from datetime import timedelta
from typing import Callable, ClassVar

from grpclib.exceptions import StreamTerminatedError
from rich.console import Console, Group, RenderableType
from rich.live import Live
from rich.panel import Panel
from rich.progress import (
    BarColumn,
    DownloadColumn,
    MofNCompleteColumn,
    Progress,
    ProgressColumn,
    TaskID,
    TextColumn,
    TimeElapsedColumn,
    TimeRemainingColumn,
    TransferSpeedColumn,
)
from rich.spinner import Spinner
from rich.text import Text

from modal._utils.time_utils import timestamp_to_localized_str
from modal_proto import api_pb2

from ._utils.grpc_utils import Retry
from ._utils.shell_utils import stream_from_stdin, write_to_fd
from .client import _Client
from .config import logger
from .exception import InternalError, ServiceError

if platform.system() == "Windows":
    default_spinner = "line"
else:
    default_spinner = "dots"


def make_console(*, stderr: bool = False, highlight: bool = True) -> Console:
    """Create a rich Console tuned for Modal CLI output."""
    return Console(
        stderr=stderr,
        highlight=highlight,
        # CLI does not work with auto-detected Jupyter HTML display_data.
        force_jupyter=False,
    )


class FunctionQueuingColumn(ProgressColumn):
    """Renders time elapsed, including task.completed as additional elapsed time."""

    def __init__(self):
        self.lag = 0
        super().__init__()

    def render(self, task) -> Text:
        self.lag = max(task.completed - task.elapsed, self.lag)
        if task.finished:
            elapsed = max(task.finished_time, task.completed)
        else:
            elapsed = task.elapsed + self.lag
        delta = timedelta(seconds=int(elapsed))
        return Text(str(delta), style="progress.elapsed")


class LineBufferedOutput:
    """Output stream that buffers lines and passes them to a callback."""

    LINE_REGEX = re.compile("(\r\n|\r|\n)")

    def __init__(self, callback: Callable[[str], None], show_timestamps: bool):
        self._callback = callback
        self._buf = ""
        self._show_timestamps = show_timestamps

    def write(self, log: api_pb2.TaskLogs):
        chunks = self.LINE_REGEX.split(self._buf + log.data)

        # re.split("(<exp>)") returns the matched groups, and also the separators.
        # e.g. re.split("(+)", "a+b") returns ["a", "+", "b"].
        # This means that chunks is guaranteed to be odd in length.

        if self._show_timestamps:
            for i in range(0, len(chunks) - 1, 2):
                chunks[i] = f"{timestamp_to_localized_str(log.timestamp)} {chunks[i]}"

        completed_lines = "".join(chunks[:-1])
        remainder = chunks[-1]

        # Partially completed lines end with a carriage return. Append a newline so that they
        # are not overwritten by the `rich.Live` and prefix the inverse operation to the remaining
        # buffer. Note that this is not perfect -- when stdout and stderr are interleaved, the results
        # can have unexpected spacing.
        if completed_lines.endswith("\r"):
            completed_lines = completed_lines[:-1] + "\n"
            # Prepend cursor up + carriage return.
            remainder = "\x1b[1A\r" + remainder

        self._callback(completed_lines)
        self._buf = remainder

    def flush(self):
        pass

    def finalize(self):
        if self._buf:
            self._callback(self._buf)
            self._buf = ""


class OutputManager:
    _instance: ClassVar[OutputManager | None] = None

    _console: Console
    _task_states: dict[str, int]
    _task_progress_items: dict[tuple[str, int], TaskID]
    _current_render_group: Group | None
    _function_progress: Progress | None
    _function_queueing_progress: Progress | None
    _snapshot_progress: Progress | None
    _line_buffers: dict[int, LineBufferedOutput]
    _status_spinner: Spinner
    _app_page_url: str | None
    _show_image_logs: bool
    _status_spinner_live: Live | None
    _show_timestamps: bool

    def __init__(
        self,
        *,
        status_spinner_text: str = "Running app...",
        show_timestamps: bool = False,
    ):
        self._stdout = sys.stdout
        self._console = make_console(highlight=False)
        self._task_states = {}
        self._task_progress_items = {}
        self._current_render_group = None
        self._function_progress = None
        self._function_queueing_progress = None
        self._snapshot_progress = None
        self._line_buffers = {}
        self._status_spinner = OutputManager.step_progress(status_spinner_text)
        self._app_page_url = None
        self._show_image_logs = False
        self._status_spinner_live = None
        self._show_timestamps = show_timestamps

    @classmethod
    def disable(cls):
        cls._instance.flush_lines()
        if cls._instance._status_spinner_live:
            cls._instance._status_spinner_live.stop()
        cls._instance = None

    @classmethod
    def get(cls) -> OutputManager | None:
        return cls._instance

    @classmethod
    @contextlib.contextmanager
    def enable_output(cls, show_progress: bool = True, show_timestamps: bool = False) -> Generator[None]:
        if show_progress:
            cls._instance = OutputManager(show_timestamps=show_timestamps)
        try:
            yield
        finally:
            cls._instance = None

    @staticmethod
    def step_progress(text: str = "") -> Spinner:
        """Returns the element to be rendered when a step is in progress."""
        return Spinner(default_spinner, text, style="blue")

    @staticmethod
    def step_completed(message: str) -> RenderableType:
        return f"[green]✓[/green] {message}"

    @staticmethod
    def substep_completed(message: str) -> RenderableType:
        return f"🔨 {message}"

    def print(self, renderable) -> None:
        self._console.print(renderable)

    def make_live(self, renderable: RenderableType) -> Live:
        """Creates a customized `rich.Live` instance with the given renderable. The renderable
        is placed in a `rich.Group` to allow for dynamic additions later."""
        self._function_progress = None
        self._current_render_group = Group(renderable)
        return Live(self._current_render_group, console=self._console, transient=True, refresh_per_second=4)

    def enable_image_logs(self):
        self._show_image_logs = True

    @property
    def function_progress(self) -> Progress:
        """Creates a `rich.Progress` instance with custom columns for function progress,
        and adds it to the current render group."""
        if not self._function_progress:
            self._function_progress = Progress(
                TextColumn("[progress.description][white]{task.description}[/white]"),
                BarColumn(),
                MofNCompleteColumn(),
                TimeRemainingColumn(),
                console=self._console,
            )
            if self._current_render_group:
                self._current_render_group.renderables.append(Panel(self._function_progress, style="gray50"))
        return self._function_progress

    @property
    def snapshot_progress(self) -> Progress:
        """Creates a `rich.Progress` instance with custom columns for image snapshot progress,
        and adds it to the current render group."""
        if not self._snapshot_progress:
            self._snapshot_progress = Progress(
                TextColumn("[progress.description]{task.description}"),
                BarColumn(),
                DownloadColumn(),
                TimeElapsedColumn(),
                console=self._console,
                transient=True,
            )
            if self._current_render_group:
                # Appear above function progress renderables.
                self._current_render_group.renderables.insert(0, self._snapshot_progress)
        return self._snapshot_progress

    @property
    def function_queueing_progress(self) -> Progress:
        """Creates a `rich.Progress` instance with custom columns for function queue waiting progress
        and adds it to the current render group."""
        if not self._function_queueing_progress:
            self._function_queueing_progress = Progress(
                TextColumn("[progress.description]{task.description}"),
                FunctionQueuingColumn(),
                console=self._console,
                transient=True,
            )
            if self._current_render_group:
                self._current_render_group.renderables.append(self._function_queueing_progress)
        return self._function_queueing_progress

    def function_progress_callback(self, tag: str, total: int | None) -> Callable[[int, int], None]:
        """Adds a task to the current function_progress instance, and returns a callback
        to update task progress with new completed and total counts."""

        progress_task = self.function_progress.add_task(tag, total=total)

        def update_counts(completed: int, total: int):
            self.function_progress.update(progress_task, completed=completed, total=total)

        return update_counts

    def _print_log(self, fd: int, data: str) -> None:
        if fd == api_pb2.FILE_DESCRIPTOR_STDOUT:
            style = "blue"
        elif fd == api_pb2.FILE_DESCRIPTOR_STDERR:
            style = "red"
        elif fd == api_pb2.FILE_DESCRIPTOR_INFO:
            style = "yellow"
        else:
            raise Exception(f"Weird file descriptor {fd} for log output")

        self._console.out(data, style=style, end="")

    def update_app_page_url(self, app_page_url: str) -> None:
        self._app_page_url = app_page_url

    def update_task_state(self, task_id: str, state: int):
        """Updates the state of a task, sets the new task status string."""
        self._task_states[task_id] = state

        all_states = self._task_states.values()
        states_set = set(all_states)

        def tasks_at_state(state):
            return sum(x == state for x in all_states)

        # The most advanced state that's present informs the message.
        if api_pb2.TASK_STATE_ACTIVE in states_set or api_pb2.TASK_STATE_IDLE in states_set:
            # Note that as of writing the server no longer uses TASK_STATE_ACTIVE, but we'll
            # make the numerator the sum of active / idle in case that is revived at some point in the future.
            tasks_running = tasks_at_state(api_pb2.TASK_STATE_ACTIVE) + tasks_at_state(api_pb2.TASK_STATE_IDLE)
            tasks_not_completed = len(self._task_states) - tasks_at_state(api_pb2.TASK_STATE_COMPLETED)
            message = f"Running ({tasks_running}/{tasks_not_completed} containers active)..."
        elif api_pb2.TASK_STATE_LOADING_IMAGE in states_set:
            tasks_loading = tasks_at_state(api_pb2.TASK_STATE_LOADING_IMAGE)
            message = f"Loading images ({tasks_loading} containers initializing)..."
        elif api_pb2.TASK_STATE_WORKER_ASSIGNED in states_set:
            message = "Worker assigned..."
        elif api_pb2.TASK_STATE_COMPLETED in states_set:
            tasks_completed = tasks_at_state(api_pb2.TASK_STATE_COMPLETED)
            message = f"Running ({tasks_completed} containers finished)..."
        else:
            message = "Running..."

        message = f"[blue]{message}[/blue] [grey70]View app at [underline]{self._app_page_url}[/underline][/grey70]"

        # Set the new message
        self._status_spinner.update(text=message)

    def update_snapshot_progress(self, image_id: str, task_progress: api_pb2.TaskProgress) -> None:
        # TODO(erikbern): move this to sit on the resolver object, mostly
        completed = task_progress.pos
        total = task_progress.len

        task_key = (image_id, api_pb2.IMAGE_SNAPSHOT_UPLOAD)
        if task_key in self._task_progress_items:
            progress_task_id = self._task_progress_items[task_key]
        else:
            progress_task_id = self.snapshot_progress.add_task("[yellow]Uploading image snapshot…", total=total)
            self._task_progress_items[task_key] = progress_task_id

        try:
            self.snapshot_progress.update(progress_task_id, completed=completed, total=total)
            if completed == total:
                self.snapshot_progress.remove_task(progress_task_id)
        except KeyError:
            # Rich throws a KeyError if the task has already been removed.
            pass

    def update_queueing_progress(
        self, *, function_id: str, completed: int, total: int | None, description: str | None
    ) -> None:
        """Handle queueing updates, ignoring completion updates for functions that have no queue progress bar."""
        task_key = (function_id, api_pb2.FUNCTION_QUEUED)
        task_description = description or f"'{function_id}' function waiting on worker"
        task_desc = f"[yellow]{task_description}. Time in queue:"
        if task_key in self._task_progress_items:
            progress_task_id = self._task_progress_items[task_key]
            try:
                self.function_queueing_progress.update(progress_task_id, completed=completed, total=total)
                if completed == total:
                    del self._task_progress_items[task_key]
                    self.function_queueing_progress.remove_task(progress_task_id)
            except KeyError:
                pass
        elif completed != total:  # Create new bar for queued function
            progress_task_id = self.function_queueing_progress.add_task(task_desc, start=True, total=None)
            self._task_progress_items[task_key] = progress_task_id

    async def put_log_content(self, log: api_pb2.TaskLogs):
        stream = self._line_buffers.get(log.file_descriptor)
        if stream is None:
            stream = LineBufferedOutput(functools.partial(self._print_log, log.file_descriptor), self._show_timestamps)
            self._line_buffers[log.file_descriptor] = stream
        stream.write(log)

    def flush_lines(self):
        for stream in self._line_buffers.values():
            stream.finalize()

    @contextlib.contextmanager
    def show_status_spinner(self):
        self._status_spinner_live = self.make_live(self._status_spinner)
        with self._status_spinner_live:
            yield


class ProgressHandler:
    live: Live
    _type: str
    _spinner: Spinner
    _overall_progress: Progress
    _download_progress: Progress
    _overall_progress_task_id: TaskID
    _total_tasks: int
    _completed_tasks: int

    def __init__(self, type: str, console: Console):
        self._type = type

        if self._type == "download":
            title = "Downloading file(s) to local..."
        elif self._type == "upload":
            title = "Uploading file(s) to volume..."
        else:
            raise NotImplementedError(f"Progress handler of type: `{type}` not yet implemented")

        self._spinner = OutputManager.step_progress(title)

        self._overall_progress = Progress(
            TextColumn(f"[bold white]{title}", justify="right"),
            TimeElapsedColumn(),
            BarColumn(bar_width=None),
            TextColumn("[bold white]{task.description}"),
            transient=True,
            console=console,
        )
        self._download_progress = Progress(
            TextColumn("[bold white]{task.fields[path]}", justify="right"),
            BarColumn(bar_width=None),
            "[progress.percentage]{task.percentage:>3.1f}%",
            "•",
            DownloadColumn(),
            "•",
            TransferSpeedColumn(),
            "•",
            TimeRemainingColumn(),
            transient=True,
            console=console,
        )

        self.live = Live(
            Group(self._spinner, self._overall_progress, self._download_progress), transient=True, refresh_per_second=4
        )

        self._overall_progress_task_id = self._overall_progress.add_task(".", start=True)
        self._total_tasks = 0
        self._completed_tasks = 0

    def _add_sub_task(self, name: str, size: float) -> TaskID:
        task_id = self._download_progress.add_task(self._type, path=name, start=True, total=size)
        self._total_tasks += 1
        self._overall_progress.update(self._overall_progress_task_id, total=self._total_tasks)
        return task_id

    def _reset_sub_task(self, task_id: TaskID):
        self._download_progress.reset(task_id)

    def _complete_progress(self):
        # TODO: we could probably implement some callback progression from the server
        # to get progress reports for the post processing too
        # so we don't have to just spin here
        self._overall_progress.remove_task(self._overall_progress_task_id)
        self._spinner.update(text="Post processing...")

    def _complete_sub_task(self, task_id: TaskID):
        self._completed_tasks += 1
        self._download_progress.remove_task(task_id)
        self._overall_progress.update(
            self._overall_progress_task_id,
            advance=1,
            description=f"({self._completed_tasks} out of {self._total_tasks} files completed)",
        )

    def _advance_sub_task(self, task_id: TaskID, advance: float):
        self._download_progress.update(task_id, advance=advance)

    def progress(
        self,
        task_id: TaskID | None = None,
        advance: float | None = None,
        name: str | None = None,
        size: float | None = None,
        reset: bool | None = False,
        complete: bool | None = False,
    ) -> TaskID | None:
        try:
            if task_id is not None:
                if reset:
                    return self._reset_sub_task(task_id)
                elif complete:
                    return self._complete_sub_task(task_id)
                elif advance is not None:
                    return self._advance_sub_task(task_id, advance)
            elif name is not None and size is not None:
                return self._add_sub_task(name, size)
            elif complete:
                return self._complete_progress()
        except Exception as exc:
            # Liberal exception handling to avoid crashing downloads and uploads.
            logger.error(f"failed progress update: {exc}")
        raise NotImplementedError(
            "Unknown action to take with args: "
            + f"name={name} "
            + f"size={size} "
            + f"task_id={task_id} "
            + f"advance={advance} "
            + f"reset={reset} "
            + f"complete={complete} "
        )


async def stream_pty_shell_input(client: _Client, exec_id: str, finish_event: asyncio.Event):
    """
    Streams stdin to the given exec id until finish_event is triggered
    """

    async def _handle_input(data: bytes, message_index: int):
        await client.stub.ContainerExecPutInput(
            api_pb2.ContainerExecPutInputRequest(
                exec_id=exec_id, input=api_pb2.RuntimeInputMessage(message=data, message_index=message_index)
            ),
            retry=Retry(total_timeout=10),
        )

    async with stream_from_stdin(_handle_input, use_raw_terminal=True):
        await finish_event.wait()


async def put_pty_content(log: api_pb2.TaskLogs, stdout):
    if hasattr(stdout, "buffer"):
        # If we're not showing progress, there's no need to buffer lines,
        # because the progress spinner can't interfere with output.

        data = log.data.encode("utf-8")
        # Non-blocking terminals can fill the kernel buffer on output bursts, making flush() raise
        # BlockingIOError (EAGAIN) and appear frozen until a key is pressed (this happened e.g. when
        # printing large data from a pdb breakpoint). If stdout has a real fd, we await a
        # non-blocking fd write (write_to_fd) instead.
        fd = None
        try:
            if hasattr(stdout, "fileno"):
                fd = stdout.fileno()
        except Exception:
            fd = None

        if fd is not None:
            await write_to_fd(fd, data)
        else:
            # For streams without fileno(), use the normal write/flush path.
            written = 0
            n_retries = 0
            while written < len(data):
                try:
                    written += stdout.buffer.write(data[written:])
                    stdout.flush()
                except BlockingIOError:
                    if n_retries >= 5:
                        raise
                    n_retries += 1
                    await asyncio.sleep(0.1)
    else:
        # `stdout` isn't always buffered (e.g. %%capture in Jupyter notebooks redirects it to
        # io.StringIO).
        stdout.write(log.data)
        stdout.flush()


async def get_app_logs_loop(
    client: _Client,
    output_mgr: OutputManager,
    app_id: str | None = None,
    task_id: str | None = None,
    sandbox_id: str | None = None,
):
    last_log_batch_entry_id = ""

    pty_shell_stdout = None
    pty_shell_finish_event: asyncio.Event | None = None
    pty_shell_task_id: str | None = None
    pty_shell_input_task: asyncio.Task | None = None

    async def stop_pty_shell():
        nonlocal pty_shell_finish_event, pty_shell_input_task
        if pty_shell_finish_event:
            print("\r", end="")  # move cursor to beginning of line # noqa: T201
            pty_shell_finish_event.set()
            pty_shell_finish_event = None

            if pty_shell_input_task:
                try:
                    await pty_shell_input_task
                except Exception as exc:
                    logger.exception(f"Exception in PTY shell input task: {exc}")
                finally:
                    pty_shell_input_task = None

    async def _put_log(log_batch: api_pb2.TaskLogsBatch, log: api_pb2.TaskLogs):
        if log.task_state:
            output_mgr.update_task_state(log_batch.task_id, log.task_state)
            if log.task_state == api_pb2.TASK_STATE_WORKER_ASSIGNED:
                # Close function's queueing progress bar (if it exists)
                output_mgr.update_queueing_progress(
                    function_id=log_batch.function_id, completed=1, total=1, description=None
                )
        elif log.task_progress.len or log.task_progress.pos:
            if log.task_progress.progress_type == api_pb2.FUNCTION_QUEUED:
                output_mgr.update_queueing_progress(
                    function_id=log_batch.function_id,
                    completed=log.task_progress.pos,
                    total=log.task_progress.len,
                    description=log.task_progress.description,
                )
            else:  # Ensure forward-compatible with new types.
                logger.debug(f"Received unrecognized progress type: {log.task_progress.progress_type}")
        elif log.data:
            if pty_shell_finish_event:
                await put_pty_content(log, pty_shell_stdout)
            else:
                await output_mgr.put_log_content(log)

    async def _get_logs():
        nonlocal last_log_batch_entry_id
        nonlocal pty_shell_stdout, pty_shell_finish_event, pty_shell_task_id, pty_shell_input_task

        request = api_pb2.AppGetLogsRequest(
            app_id=app_id or "",
            task_id=task_id or "",
            sandbox_id=sandbox_id or "",
            timeout=55,
            last_entry_id=last_log_batch_entry_id,
        )
        log_batch: api_pb2.TaskLogsBatch
        async for log_batch in client.stub.AppGetLogs.unary_stream(request):
            if log_batch.entry_id:
                # log_batch entry_id is empty for fd="server" messages from AppGetLogs
                last_log_batch_entry_id = log_batch.entry_id
            if log_batch.app_done:
                logger.debug("App logs are done")
                last_log_batch_entry_id = None
                break
            elif log_batch.image_id and not output_mgr._show_image_logs:
                # Ignore image logs while app is creating objects.
                # These logs are fetched through ImageJoinStreaming instead.
                # Logs from images built "dynamically" (after the app has started)
                # are printed through this loop.
                # TODO (akshat): have a better way of differentiating between
                # statically and dynamically built images.
                pass
            elif log_batch.pty_exec_id:
                # This corresponds to the `modal run -i` use case where a breakpoint
                # triggers and the task drops into an interactive PTY mode
                if pty_shell_finish_event:
                    print("ERROR: concurrent PTY shells are not supported.")  # noqa: T201
                else:
                    pty_shell_stdout = output_mgr._stdout
                    pty_shell_finish_event = asyncio.Event()
                    pty_shell_task_id = log_batch.task_id
                    output_mgr.disable()
                    pty_shell_input_task = asyncio.create_task(
                        stream_pty_shell_input(client, log_batch.pty_exec_id, pty_shell_finish_event)
                    )
            else:
                for log in log_batch.items:
                    await _put_log(log_batch, log)

            if log_batch.eof and log_batch.task_id == pty_shell_task_id:
                await stop_pty_shell()

        output_mgr.flush_lines()

    while True:
        try:
            await _get_logs()
        except (ServiceError, InternalError, StreamTerminatedError, socket.gaierror, AttributeError) as exc:
            if isinstance(exc, (ServiceError, InternalError)):
                # Try again if we had a temporary connection drop, for example if computer went to sleep.
                logger.debug("Log fetching timed out. Retrying ...")
                continue
            elif isinstance(exc, StreamTerminatedError):
                logger.debug("Stream closed. Retrying ...")
                continue
            elif isinstance(exc, socket.gaierror):
                logger.debug("Lost connection. Retrying ...")
                continue
            elif isinstance(exc, AttributeError):
                if "_write_appdata" in str(exc):
                    # Happens after losing connection
                    # StreamTerminatedError are not properly raised in grpclib<=0.4.7
                    # fixed in https://github.com/vmagamedov/grpclib/issues/185
                    # TODO: update to newer version (>=0.4.8) once stable
                    logger.debug("Lost connection. Retrying ...")
                    continue
            raise

        if last_log_batch_entry_id is None:
            break

    await stop_pty_shell()

    logger.debug("Logging exited gracefully")
