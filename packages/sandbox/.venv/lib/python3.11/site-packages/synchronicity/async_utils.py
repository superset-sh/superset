import asyncio
import signal
import sys
import threading
import typing

from synchronicity.exceptions import NestedEventLoops

T = typing.TypeVar("T")


class Runner:
    """Simplified backport of asyncio.Runner from Python 3.11

    Like asyncio.run() but allows multiple calls to the same event loop
    before teardown, and is converts sigints into graceful cancellations
    similar to asyncio.run on Python 3.11+.
    """

    def __enter__(self) -> "Runner":
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            pass  # no event loop - this is what we expect!
        else:
            raise NestedEventLoops()

        self._loop = asyncio.new_event_loop()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self._loop.run_until_complete(self._loop.shutdown_asyncgens())
        if sys.version_info[:2] >= (3, 9):
            # Introduced in Python 3.9
            self._loop.run_until_complete(self._loop.shutdown_default_executor())

        self._loop.close()
        return False

    def run(self, coro: typing.Awaitable[T]) -> T:
        is_main_thread = threading.current_thread() == threading.main_thread()
        self._num_sigints = 0

        coro_task = asyncio.ensure_future(coro, loop=self._loop)

        async def wrapper_coro():
            # this wrapper ensures that we won't reraise KeyboardInterrupt into
            # the calling scope until all async finalizers in coro_task have
            # finished executing. It even allows the coro to prevent cancellation
            # and thereby ignoring the first keyboardinterrupt
            return await coro_task

        def _sigint_handler(signum, frame):
            # cancel the task in order to have run_until_complete return soon and
            # prevent a bunch of unwanted tracebacks when shutting down the
            # event loop.

            # this basically replicates the sigint handler installed by asyncio.run()
            self._num_sigints += 1
            if self._num_sigints == 1:
                # first sigint is graceful
                self._loop.call_soon_threadsafe(coro_task.cancel)
                return

            # this should normally not happen, but the second sigint would "hard kill" the event loop
            # by raising KeyboardInterrupt inside of it
            raise KeyboardInterrupt()

        original_sigint_handler = None
        try:
            # only install signal handler if running from main thread and we haven't disabled sigint
            handle_sigint = is_main_thread and signal.getsignal(signal.SIGINT) == signal.default_int_handler

            if handle_sigint:
                # intentionally not using _loop.add_signal_handler since it's slow (?)
                # and not available on Windows. We just don't want the sigint to
                # mess with the event loop anyways
                original_sigint_handler = signal.signal(signal.SIGINT, _sigint_handler)
        except KeyboardInterrupt:
            # this is quite unlikely, but with bad timing we could get interrupted before
            # installing the sigint handler and this has happened repeatedly in unit tests
            _sigint_handler(signal.SIGINT, None)

        try:
            return self._loop.run_until_complete(wrapper_coro())
        except asyncio.CancelledError:
            if self._num_sigints > 0:
                raise KeyboardInterrupt()  # might want to use original_sigint_handler here instead?
            raise  # "internal" cancellations, not triggered by KeyboardInterrupt
        finally:
            if original_sigint_handler:
                # reset signal handler
                signal.signal(signal.SIGINT, original_sigint_handler)
