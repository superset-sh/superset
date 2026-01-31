import asyncio
import inspect


class Callback:
    """A callback is when synchronized call needs to call outside functions passed into it.

    Currently only supports non-generator functions."""

    def __init__(self, synchronizer, f):
        self._synchronizer = synchronizer
        self._f = f

    def _invoke(self, args, kwargs):
        # This runs on a separate thread
        res = self._f(*args, **kwargs)
        if inspect.iscoroutine(res):
            try:
                loop = asyncio.new_event_loop()
                return loop.run_until_complete(res)
            finally:
                loop.close()
        elif inspect.isasyncgen(res):
            raise RuntimeError("Async generators are not supported")
        elif inspect.isgenerator(res):
            raise RuntimeError("Generators are not supported")
        else:
            return res

    async def __call__(self, *args, **kwargs):
        # This translates the opposite way from the code in the synchronizer
        args = self._synchronizer._translate_out(args)
        kwargs = self._synchronizer._translate_out(kwargs)

        # This function may be blocking, so we need to run it on a thread
        loop = asyncio.get_event_loop()
        res = await loop.run_in_executor(None, self._invoke, args, kwargs)

        # Now, we need to translate the result _in_
        return self._synchronizer._translate_in(res)
