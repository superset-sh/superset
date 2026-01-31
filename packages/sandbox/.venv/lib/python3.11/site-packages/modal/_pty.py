# Copyright Modal Labs 2022
import contextlib
import os
import sys
from typing import Optional

from modal_proto import api_pb2


def get_winsz(fd=None) -> tuple[Optional[int], Optional[int]]:
    try:
        if fd is None:
            fd = sys.stdin.fileno()

        import fcntl
        import struct
        import termios

        return struct.unpack("hh", fcntl.ioctl(fd, termios.TIOCGWINSZ, "1234"))  # type: ignore
    except Exception:
        return None, None


def set_nonblocking(fd: int):
    import fcntl

    fl = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)


@contextlib.contextmanager
def raw_terminal():
    import termios
    import tty

    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)

    try:
        tty.setraw(fd, termios.TCSADRAIN)
        yield
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)


def get_pty_info(shell: bool, no_terminate_on_idle_stdin: bool = False) -> api_pb2.PTYInfo:
    rows, cols = get_winsz()
    return api_pb2.PTYInfo(
        enabled=True,  # TODO(erikbern): deprecated
        winsz_rows=rows,
        winsz_cols=cols,
        env_term=os.environ.get("TERM"),
        env_colorterm=os.environ.get("COLORTERM"),
        env_term_program=os.environ.get("TERM_PROGRAM"),
        pty_type=api_pb2.PTYInfo.PTY_TYPE_SHELL if shell else api_pb2.PTYInfo.PTY_TYPE_FUNCTION,
        no_terminate_on_idle_stdin=no_terminate_on_idle_stdin,
    )
