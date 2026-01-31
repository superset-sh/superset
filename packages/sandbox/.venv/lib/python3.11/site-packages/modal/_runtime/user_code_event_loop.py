# Copyright Modal Labs 2022
# ruff: noqa: E402
import asyncio
import signal
import sys


class UserCodeEventLoop:
    """Run an async event loop as a context manager and handle signals.

    This will run all *user supplied* async code, i.e. async functions, as well as async enter/exit managers

    The following signals are handled while a coroutine is running on the event loop until
    completion (and then handlers are deregistered):

    - `SIGUSR1`: converted to an async task cancellation. Note that this only affects the event
      loop, and the signal handler defined here doesn't run for sync functions.
    - `SIGINT`: Unless the global signal handler has been set to SIGIGN, the loop's signal handler
        is set to cancel the current task and raise KeyboardInterrupt to the caller.
    """

    def __enter__(self):
        self.loop = asyncio.new_event_loop()
        self.tasks = set()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.loop.run_until_complete(self.loop.shutdown_asyncgens())
        if sys.version_info[:2] >= (3, 9):
            self.loop.run_until_complete(self.loop.shutdown_default_executor())  # Introduced in Python 3.9

        for task in self.tasks:
            task.cancel()

        self.loop.close()

    def create_task(self, coro):
        task = self.loop.create_task(coro)
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        return task

    def run(self, coro):
        task = asyncio.ensure_future(coro, loop=self.loop)
        self._sigints = 0

        def _sigint_handler():
            # cancel the task in order to have run_until_complete return soon and
            # prevent a bunch of unwanted tracebacks when shutting down the
            # event loop.

            # this basically replicates the sigint handler installed by asyncio.run()
            self._sigints += 1
            if self._sigints == 1:
                # first sigint is graceful
                task.cancel()
                return

            # this should normally not happen, but the second sigint would "hard kill" the event loop!
            raise KeyboardInterrupt()

        ignore_sigint = signal.getsignal(signal.SIGINT) == signal.SIG_IGN
        if not ignore_sigint:
            self.loop.add_signal_handler(signal.SIGINT, _sigint_handler)

        # Before Python 3.9 there is no argument to Task.cancel
        if sys.version_info[:2] >= (3, 9):
            self.loop.add_signal_handler(signal.SIGUSR1, task.cancel, "Input was cancelled by user")
        else:
            self.loop.add_signal_handler(signal.SIGUSR1, task.cancel)

        try:
            return self.loop.run_until_complete(task)
        except asyncio.CancelledError:
            if self._sigints > 0:
                raise KeyboardInterrupt()
        finally:
            self.loop.remove_signal_handler(signal.SIGUSR1)
            if not ignore_sigint:
                self.loop.remove_signal_handler(signal.SIGINT)
