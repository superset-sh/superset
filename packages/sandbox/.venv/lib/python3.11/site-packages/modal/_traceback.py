# Copyright Modal Labs 2022
"""Helper functions related to operating on exceptions, warnings, and traceback objects.

Functions related to *displaying* tracebacks should go in `modal/cli/_traceback.py`
so that Rich is not a dependency of the container Client.
"""

import re
import sys
import traceback
import typing
import warnings
from types import TracebackType
from typing import Any, Iterable, Optional

from modal.config import config
from modal_proto import api_pb2

from ._vendor.tblib import Traceback as TBLibTraceback
from .exception import ServerWarning

TBDictType = dict[str, Any]
LineCacheType = dict[tuple[str, str], str]


def extract_traceback(exc: BaseException, task_id: str) -> tuple[TBDictType, LineCacheType]:
    """Given an exception, extract a serializable traceback (with task ID markers included),
    and a line cache that maps (filename, lineno) to line contents. The latter is used to show
    a helpful traceback to the user, even if they don't have packages installed locally that
    are referenced in the traceback."""

    tb = TBLibTraceback(exc.__traceback__)
    # Prefix traceback file paths with <task_id>. This lets us attribute which parts of
    # the traceback came from specific remote containers, while still fitting in the TracebackType
    # spec. Real paths can never start with <; we can use this to extract task_ids from filenames
    # at the client.
    cur = tb
    while cur is not None:
        file = cur.tb_frame.f_code.co_filename

        # Paths starting with < indicate that they're from a traceback from a remote
        # container. This means we've reached the end of the local traceback.
        if file.startswith("<"):
            break
        # We rely on this specific filename format when inferring where the exception was raised
        # in various other exception-related code
        cur.tb_frame.f_code.co_filename = f"<{task_id}>:{file}"
        cur = cur.tb_next

    tb_dict = tb.to_dict()

    line_cache = getattr(exc, "__line_cache__", {})

    for frame in traceback.extract_tb(exc.__traceback__):
        line_cache[(frame.filename, frame.lineno)] = frame.line

    return tb_dict, line_cache


def append_modal_tb(exc: BaseException, tb_dict: TBDictType, line_cache: LineCacheType) -> None:
    tb = TBLibTraceback.from_dict(tb_dict).as_traceback()

    # Filter out the prefix corresponding to internal Modal frames, and then make
    # the remote traceback from a Modal function the starting point of the current
    # exception's traceback.

    while tb is not None:
        if "/pkg/modal/" not in tb.tb_frame.f_code.co_filename:
            break
        tb = tb.tb_next

    exc.__traceback__ = tb

    setattr(exc, "__line_cache__", line_cache)


def reduce_traceback_to_user_code(tb: Optional[TracebackType], user_source: str) -> TracebackType:
    """Return a traceback that does not contain modal entrypoint or synchronicity frames."""

    # Step forward all the way through the traceback and drop any "Modal support" frames
    def skip_frame(filename: str) -> bool:
        return "/site-packages/synchronicity/" in filename or "modal/_utils/deprecation" in filename

    tb_root = tb
    while tb is not None:
        while tb.tb_next is not None:
            if skip_frame(tb.tb_next.tb_frame.f_code.co_filename):
                tb.tb_next = tb.tb_next.tb_next
            else:
                break
        tb = tb.tb_next
    tb = tb_root

    # Now step forward again until we get to first frame of user code
    if user_source.endswith(".py"):
        while tb is not None and tb.tb_frame.f_code.co_filename != user_source:
            tb = tb.tb_next
    else:
        while tb is not None and tb.tb_frame.f_code.co_name != "<module>":
            tb = tb.tb_next
    if tb is None:
        # In case we didn't find a frame that matched the user source, revert to the original root
        tb = tb_root

    return tb


def traceback_contains_remote_call(tb: Optional[TracebackType]) -> bool:
    """Inspect the traceback stack to determine whether an error was raised locally or remotely."""
    while tb is not None:
        if re.match(r"^<ta-[0-9A-Z]{26}>:", tb.tb_frame.f_code.co_filename):
            return True
        tb = tb.tb_next
    return False


def print_exception(exc: Optional[type[BaseException]], value: Optional[BaseException], tb: Optional[TracebackType]):
    """Add backwards compatibility for printing exceptions with "notes" for Python<3.11."""
    traceback.print_exception(exc, value, tb)
    if sys.version_info < (3, 11) and value is not None:  # type: ignore
        notes = getattr(value, "__notes__", [])
        print(*notes, sep="\n", file=sys.stderr)  # noqa: T201


def print_server_warnings(server_warnings: Iterable[api_pb2.Warning]):
    """Issue a warning originating from the server with empty metadata about local origin.

    When using the Modal CLI, these warnings should get caught and coerced into Rich panels.
    """
    for warning in server_warnings:
        warnings.warn_explicit(warning.message, ServerWarning, "<modal-server>", 0)


# for some reason, the traceback cleanup here can't be moved into a context manager :(
traceback_suppression_note = (
    "Internal Modal traceback frames are suppressed for readability. Use MODAL_TRACEBACK=1 to show a full traceback."
)


class suppress_tb_frame:
    def __enter__(self):
        pass

    def __exit__(
        self, exc_type: Optional[type[BaseException]], exc: Optional[BaseException], tb: Optional[TracebackType]
    ) -> typing.Literal[False]:
        # *base* exceptions like CancelledError, SystemExit etc. can come from random places,
        # so we don't suppress tracebacks for those
        is_base_exception = not isinstance(exc, Exception)
        if config.get("traceback") or exc_type is None or is_base_exception:
            return False

        # modify traceback on exception object
        final_tb = tb.tb_next if tb is not None else tb

        exc.with_traceback(final_tb)
        notes = getattr(exc, "__notes__", [])
        if traceback_suppression_note not in notes:
            # .add_note was added in Python 3.11
            notes.append(traceback_suppression_note)
        return False
