import sys
import signal
import asyncio
import warnings

from types import TracebackType
from typing import TYPE_CHECKING, Optional, Set, Type, ContextManager, List
from typing import Iterator, Collection, Callable, Any, cast
from functools import wraps
from contextlib import contextmanager


if sys.version_info > (3, 7):
    _current_task = asyncio.current_task
else:
    _current_task = asyncio.Task.current_task


if TYPE_CHECKING:
    from .metadata import Deadline  # noqa
    from ._typing import IServable, IClosable  # noqa


class Wrapper(ContextManager[None]):
    """Special wrapper for coroutines to wake them up in case of some error.

    Example:

    .. code-block:: python3

        w = Wrapper()

        async def blocking_call():
            with w:
                await asyncio.sleep(10)

        # and somewhere else:
        w.cancel(NoNeedToWaitError('With explanation'))

    """
    _error: Optional[Exception] = None

    cancelled: Optional[bool] = None
    cancel_failed: Optional[bool] = None

    def __init__(self) -> None:
        self._tasks: Set['asyncio.Task[Any]'] = set()

    def __enter__(self) -> None:
        if self._error is not None:
            raise self._error

        task = _current_task()
        if task is None:
            raise RuntimeError('Called not inside a task')

        self._tasks.add(task)

    def __exit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> None:
        task = _current_task()
        assert task
        self._tasks.discard(task)
        if self._error is not None:
            self.cancel_failed = exc_type is not asyncio.CancelledError
            raise self._error

    def cancel(self, error: Exception) -> None:
        self._error = error
        for task in self._tasks:
            task.cancel()
        self.cancelled = True


class DeadlineWrapper(Wrapper):
    """Deadline wrapper to specify deadline once for any number of awaiting
    method calls.

    Example:

    .. code-block:: python3

        dw = DeadlineWrapper()

        with dw.start(deadline):
            await handle_request()

        # somewhere during request handling:

        async def blocking_call():
            with dw:
                await asyncio.sleep(10)

    """
    @contextmanager
    def start(self, deadline: 'Deadline') -> Iterator[None]:
        timeout = deadline.time_remaining()
        if not timeout:
            raise asyncio.TimeoutError('Deadline exceeded')

        def callback() -> None:
            self.cancel(asyncio.TimeoutError('Deadline exceeded'))

        loop = asyncio.get_event_loop()
        timer = loop.call_later(timeout, callback)
        try:
            yield
        finally:
            timer.cancel()


def _service_name(service: 'IServable') -> str:
    methods = service.__mapping__()
    method_name = next(iter(methods), None)
    assert method_name is not None
    _, service_name, _ = method_name.split('/')
    return service_name


def _first_stage(
    sig_num: 'signal.Signals',
    servers: Collection['IClosable'],
) -> None:
    fail = False
    for server in servers:
        try:
            server.close()
        except RuntimeError:
            # probably server wasn't started yet
            fail = True
    if fail:
        # using second stage in case of error will ensure that non-closed
        # server wont start later
        _second_stage(sig_num)


def _second_stage(sig_num: 'signal.Signals') -> None:
    raise SystemExit(128 + sig_num)


def _exit_handler(
    sig_num: int,
    servers: Collection['IClosable'],
    flag: List[bool],
) -> None:
    if flag:
        _second_stage(cast('signal.Signals', sig_num))
    else:
        _first_stage(cast('signal.Signals', sig_num), servers)
        flag.append(True)


@contextmanager
def graceful_exit(
    servers: Collection['IClosable'],
    *,
    loop: Optional[asyncio.AbstractEventLoop] = None,
    signals: Collection[int] = (signal.SIGINT, signal.SIGTERM),
) -> Iterator[None]:
    """Utility context-manager to help properly shutdown server in response to
    the OS signals

    By default this context-manager handles ``SIGINT`` and ``SIGTERM`` signals.

    There are two stages:

      1. first received signal closes servers
      2. subsequent signals raise ``SystemExit`` exception

    Example:

    .. code-block:: python3

        async def main(...):
            ...
            with graceful_exit([server]):
                await server.start(host, port)
                print('Serving on {}:{}'.format(host, port))
                await server.wait_closed()
                print('Server closed')

    First stage calls ``server.close()`` and ``await server.wait_closed()``
    should complete successfully without errors. If server wasn't started yet,
    second stage runs to prevent server start.

    Second stage raises ``SystemExit`` exception, but you will receive
    ``asyncio.CancelledError`` in your ``async def main()`` coroutine. You
    can use ``try..finally`` constructs and context-managers to properly handle
    this error.

    This context-manager is designed to work in cooperation with
    :py:func:`python:asyncio.run` function:

    .. code-block:: python3

        if __name__ == '__main__':
            asyncio.run(main())

    :param servers: list of servers
    :param loop: (deprecated) asyncio-compatible event loop
    :param signals: set of the OS signals to handle

    .. note:: Not supported in Windows
    """
    if loop:
        warnings.warn("The loop argument is deprecated and scheduled "
                      "for removal in grpclib 0.5",
                      DeprecationWarning, stacklevel=2)

    loop = loop or asyncio.get_event_loop()
    signals = set(signals)
    flag: 'List[bool]' = []
    for sig_num in signals:
        loop.add_signal_handler(sig_num, _exit_handler, sig_num, servers, flag)
    try:
        yield
    finally:
        for sig_num in signals:
            loop.remove_signal_handler(sig_num)


def _cached(func: Callable[[], Any]) -> Callable[[], Any]:
    @wraps(func)
    def wrapper() -> Any:
        try:
            return func.__result__  # type: ignore
        except AttributeError:
            func.__result__ = func()  # type: ignore
            return func.__result__  # type: ignore
    return wrapper
