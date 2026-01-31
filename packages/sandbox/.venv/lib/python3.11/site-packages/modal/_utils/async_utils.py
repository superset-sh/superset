# Copyright Modal Labs 2022
import asyncio
import concurrent.futures
import contextlib
import functools
import inspect
import itertools
import os
import sys
import time
import types
import typing
import warnings
from collections.abc import AsyncGenerator, AsyncIterable, Awaitable, Iterable, Iterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import (
    Any,
    Callable,
    Generic,
    Optional,
    TypeVar,
    Union,
    cast,
)

import synchronicity
from synchronicity.async_utils import Runner
from synchronicity.combined_types import MethodWithAio
from synchronicity.exceptions import NestedEventLoops
from typing_extensions import ParamSpec, assert_type

from modal._ipython import is_interactive_ipython
from modal._utils.deprecation import deprecation_warning

from ..exception import AsyncUsageWarning, InvalidError
from .logger import logger

T = TypeVar("T")
P = ParamSpec("P")
V = TypeVar("V")

if sys.platform == "win32":
    # quick workaround for deadlocks on shutdown - need to investigate further
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def rewrite_sync_to_async(code_line: str, original_func: Callable) -> tuple[bool, str]:
    """
    Rewrite a blocking call to use async/await syntax.

    Handles four patterns:
    1. __aiter__: for x in obj -> async for x in obj
    2. __aenter__: with obj as x -> async with obj as x
    3. Async generators in for loops: for x in obj.method(...) -> async for x in obj.method(...)
    4. Regular methods: obj.method() -> await obj.method.aio()

    Args:
        code_line: The line of code containing the blocking call
        original_func: The original function object being called

    Returns:
        A tuple of (success, rewritten_code):
        - success: True if the pattern was found and rewritten, False if falling back to generic
        - rewritten_code: The rewritten code or a generic suggestion
    """
    import re

    func_name = original_func.__name__  # type: ignore

    # Check if this is an async generator function
    is_async_gen = inspect.isasyncgenfunction(original_func)

    # Handle __aiter__ pattern: for x in obj -> async for x in obj
    if func_name == "__aiter__" and code_line.startswith("for "):
        suggestion = code_line.replace("for ", "async for ", 1)
        return (True, suggestion)

    # Handle __aenter__ pattern: with obj as x -> async with obj as x
    if func_name == "__aenter__" and code_line.startswith("with "):
        suggestion = code_line.replace("with ", "async with ", 1)
        return (True, suggestion)

    # Handle __setitem__ pattern: dct['key'] = value -> suggest alternative
    if func_name == "__setitem__":
        # Try to extract the object and key from the bracket syntax
        setitem_match = re.match(r"(\w+)\[([^\]]+)\]\s*=\s*(.+)", code_line.strip())
        if setitem_match:
            obj, key, value = setitem_match.groups()
            suggestion = (
                f"You can't use `{obj}[{key}] = {value}` syntax asynchronously - "
                f"there may be an alternative api, e.g. {obj}.put.aio({key}, {value})"
            )
            return (False, suggestion)
        return (False, f"await ...{func_name}.aio(...)")

    # Handle __getitem__ pattern: dct['key'] -> suggest alternative
    if func_name == "__getitem__":
        # Try to extract the object and key from the bracket syntax
        getitem_match = re.match(r"(\w+)\[([^\]]+)\]$", code_line.strip())
        if getitem_match:
            obj, key = getitem_match.groups()
            suggestion = (
                f"You can't use `{obj}[{key}]` syntax asynchronously - "
                f"there may be an alternative api, e.g. {obj}.get.aio({key})"
            )
            return (False, suggestion)
        return (False, f"await ...{func_name}.aio(...)")

    # Handle async generator methods in for loops: for x in obj.method(...) -> async for x in obj.method(...)
    if is_async_gen and code_line.strip().startswith("for "):
        # Pattern: for <var> in <expr>.<method>(<args>):
        for_pattern = rf"(for\s+\w+\s+in\s+.*\.){re.escape(func_name)}(\s*\()"
        for_match = re.search(for_pattern, code_line)

        if for_match:
            # Just replace "for" with "async for" - no .aio() needed for async generators
            suggestion = code_line.replace("for ", "async for ", 1)
            return (True, suggestion)

    # Handle regular method calls and property access
    # First check if it's a property access (no parentheses after the name)
    property_pattern = rf"\.{re.escape(func_name)}(?!\s*\()"
    property_match = re.search(property_pattern, code_line)

    if property_match:
        # This is a property access, rewrite to use await without .aio()
        # Find the start of the expression (skip statement keywords and assignments)
        statement_start = 0
        prefix_match = re.match(r"^(\s*(?:\w+\s*=|return|yield|raise)\s+)", code_line)
        if prefix_match:
            statement_start = len(prefix_match.group(1))

        before_expr = code_line[:statement_start]
        after_prefix = code_line[statement_start:]

        # Just add await before the expression for properties
        suggestion = before_expr + "await " + after_prefix.lstrip()
        return (True, suggestion)

    # Try to find a method call (with parentheses)
    method_pattern = rf"\.{re.escape(func_name)}\s*\("
    method_match = re.search(method_pattern, code_line)

    if not method_match:
        # Can't find the function call or property
        return (False, f"await ...{func_name}.aio(...)")

    # Safety check: don't attempt rewrite for complex expressions
    unsafe_keywords = ["if", "elif", "while", "and", "or", "not", "in", "is", "for"]

    # Check if line contains control flow keywords (might be too complex)
    for keyword in unsafe_keywords:
        if re.search(rf"\b{keyword}\b", code_line):
            # Fall back to generic suggestion for complex expressions
            return (False, f"await ...{func_name}.aio(...)")

    # Find the start of the object expression that leads to the method call
    # We need to find where the object/chain starts, e.g., in "2 * foo.bar.method()" we want "foo"
    # Work backwards from the method match to find the start of the identifier chain
    method_start = method_match.start()

    # Find the start of the identifier chain (the object being called)
    # Walk backwards to find identifiers and dots that form the chain
    expr_start = method_start
    i = method_start - 1
    while i >= 0:
        c = code_line[i]
        if c.isalnum() or c == "_" or c == ".":
            expr_start = i
            i -= 1
        elif c.isspace():
            # Skip whitespace within the chain (though unusual)
            i -= 1
        else:
            # Found a non-identifier character, stop
            break

    # Now expr_start points to the start of the object chain (e.g., "foo" in "foo.method()")
    # But we need to check if the identifier we found is actually a keyword like return/yield/raise
    # In that case, skip over it and find the actual object
    before_obj = code_line[:expr_start]
    obj_and_rest = code_line[expr_start:]

    # Check if what we found starts with a statement keyword
    keyword_match = re.match(r"^(return|yield|raise)\s+", obj_and_rest)
    if keyword_match:
        # The "object" we found is actually a keyword, adjust to skip it
        keyword_len = len(keyword_match.group(0))
        before_obj = code_line[: expr_start + keyword_len]
        obj_and_rest = code_line[expr_start + keyword_len :]

    # Add .aio() after the method name and await before the object
    rewritten_expr = re.sub(rf"(\.{re.escape(func_name)})\s*\(", r"\1.aio(", obj_and_rest, count=1)
    suggestion = before_obj + "await " + rewritten_expr

    return (True, suggestion)


@dataclass
class _CallFrame:
    """Simple dataclass to hold call frame information."""

    filename: str
    lineno: int
    line: Optional[str]


def _extract_user_call_frame():
    """
    Extract the call frame from user code by filtering out frames from synchronicity and asyncio.

    Returns a _CallFrame with the filename, line number, and source line, or None if not found.
    """
    import linecache
    import os

    # Get the current call stack
    stack = inspect.stack()

    # Get the absolute path of this module to filter it out
    this_file = os.path.abspath(__file__)

    # Filter out frames from synchronicity, asyncio, and this module
    for frame_info in stack:
        filename = frame_info.filename
        # Skip frames from synchronicity, asyncio packages, and this module
        # Use path separators to ensure we're matching packages, not just filenames containing these words
        if (
            os.path.sep + "synchronicity" + os.path.sep in filename
            or os.path.sep + "asyncio" + os.path.sep in filename
            or os.path.abspath(filename) == this_file
        ):
            continue

        # Found a user frame
        line = linecache.getline(filename, frame_info.lineno)
        return _CallFrame(filename=filename, lineno=frame_info.lineno, line=line if line else None)

    # Fallback if we can't find a suitable frame
    return None


def _blocking_in_async_warning(original_func: types.FunctionType):
    if is_interactive_ipython():
        # in notebooks or interactive sessions where sync usage is expected
        # even if it's actually running in an event loop
        return

    import warnings

    # Skip warnings for __aexit__ and __anext__ - the __aenter__ and __aiter__ warnings are sufficient
    if original_func:
        func_name = getattr(original_func, "__name__", str(original_func))
        if func_name in ("__aexit__", "__anext__"):
            # These dunders would typically already have caused a warning on the __aenter__ or __aiter__ respectively
            return

    # Extract the call frame from the stack
    call_frame = _extract_user_call_frame()

    # Build detailed warning message with location and function first
    message_parts = [
        "A blocking Modal interface is being used in an async context.",
        "\n\nThis may cause performance issues or bugs.",
        " Consider rewriting to use Modal's async interfaces:",
        "\nhttps://modal.com/docs/guide/async",
    ]

    # Generate intelligent suggestion based on the context
    suggestion = None
    code_line = None

    if original_func and call_frame and call_frame.line:
        code_line = call_frame.line.strip()
        # Use the unified rewrite function for all patterns
        _, suggestion = rewrite_sync_to_async(code_line, original_func)

    # Add suggestion in "change X to Y" format
    if suggestion and code_line:
        # this is a bit ugly, but the warnings formatter will show the offending source line
        # on the last line regardless what we do, so we add this to not make it look out of place
        message_parts.append(f"\n\nSuggested rewrite:\n  {suggestion}\n\nOriginal line:")

    # Use warn_explicit to provide precise location information from the call frame
    if call_frame:
        # Extract module name from filename, or use a default
        module_name = os.path.splitext(os.path.basename(call_frame.filename))[0]

        warnings.warn_explicit(
            "".join(message_parts),
            AsyncUsageWarning,
            filename=call_frame.filename,
            lineno=call_frame.lineno,
            module=module_name,
        )
    else:
        # Fallback to regular warn if no frame information available
        warnings.warn("".join(message_parts), AsyncUsageWarning)


def _safe_blocking_in_async_warning(original_func: types.FunctionType):
    """
    Safety wrapper around _blocking_in_async_warning to ensure it never raises exceptions.

    This is non-critical functionality (just a warning), so we don't want it to break user code.
    However, if the warning has been configured to be treated as an error (via filterwarnings),
    we should let that propagate.
    """
    from ..config import config

    if not config.get("async_warnings"):
        return
    try:
        _blocking_in_async_warning(original_func)
    except AsyncUsageWarning:
        # Re-raise the warning if it's been configured as an error
        raise
    except Exception:
        # Silently ignore any other errors in the warning system
        # We don't want the warning mechanism itself to cause problems
        pass


synchronizer = synchronicity.Synchronizer(blocking_in_async_callback=_safe_blocking_in_async_warning)


def synchronize_api(obj, target_module=None):
    if inspect.isclass(obj) or inspect.isfunction(obj):
        blocking_name = obj.__name__.lstrip("_")
    elif isinstance(obj, TypeVar):
        blocking_name = "_BLOCKING_" + obj.__name__
    else:
        blocking_name = None
    if target_module is None:
        target_module = obj.__module__
    return synchronizer.create_blocking(obj, blocking_name, target_module=target_module)


# Used for testing to configure the `n_attempts` that `retry` will use.
RETRY_N_ATTEMPTS_OVERRIDE: Optional[int] = None


def retry(direct_fn=None, *, n_attempts=3, base_delay=0, delay_factor=2, timeout=90):
    """Decorator that calls an async function multiple times, with a given timeout.

    If a `base_delay` is provided, the function is given an exponentially
    increasing delay on each run, up until the maximum number of attempts.

    Usage:

    ```
    @retry
    async def may_fail_default():
        # ...
        pass

    @retry(n_attempts=5, base_delay=1)
    async def may_fail_delay():
        # ...
        pass
    ```
    """

    def decorator(fn):
        @functools.wraps(fn)
        async def f_wrapped(*args, **kwargs):
            if RETRY_N_ATTEMPTS_OVERRIDE is not None:
                local_n_attempts = RETRY_N_ATTEMPTS_OVERRIDE
            else:
                local_n_attempts = n_attempts

            delay = base_delay
            for i in range(local_n_attempts):
                t0 = time.time()
                try:
                    return await asyncio.wait_for(fn(*args, **kwargs), timeout=timeout)
                except asyncio.CancelledError:
                    logger.debug(f"Function {fn} was cancelled")
                    raise
                except Exception as e:
                    if i >= local_n_attempts - 1:
                        raise
                    logger.debug(
                        f"Failed invoking function {fn}: {e}"
                        f" (took {time.time() - t0}s, sleeping {delay}s"
                        f" and trying {local_n_attempts - i - 1} more times)"
                    )
                await asyncio.sleep(delay)
                delay *= delay_factor

        return f_wrapped

    if direct_fn is not None:
        # It's invoked like @retry
        return decorator(direct_fn)
    else:
        # It's invoked like @retry(n_attempts=...)
        return decorator


class TaskContext:
    """A structured group that helps manage stray tasks.

    This differs from the standard library `asyncio.TaskGroup` in that it *cancels* tasks still
    running after exiting the context manager, rather than waiting for them to finish.

    Arguments:
    `grace: float`: period in seconds, which will wait for a certain amount of time before cancelling
    all remaining tasks. This is useful for allowing tasks to finish after the context exits.

    `cancellation_grace: float = 1.0`: period in seconds that cancelled tasks are allowed to stall before
    they exit once they get cancelled (e.g. if they do async handling of the CancelledError). If tasks
    take longer than this to exit the tasks are left dangling when the context exits.

    Usage:

    ```python notest
    async with TaskContext(grace=1.0) as task_context:
        task = task_context.create_task(coro())
    ```
    """

    _loops: set[asyncio.Task]

    def __init__(self, grace: Optional[float] = None, *, cancellation_grace: float = 1.0):
        self._grace = grace  # grace is the time we want for tasks to finish before cancelling them
        self._cancellation_grace: float = (
            cancellation_grace  # extra graceperiod for the cancellation itself to "bubble up"
        )
        self._loops = set()

    async def start(self):
        # TODO: this only exists as a standalone method because Client doesn't have a proper ctx mgr
        self._tasks: set[asyncio.Task] = set()
        self._exited: asyncio.Event = asyncio.Event()  # Used to stop infinite loops

    @property
    def exited(self) -> bool:
        return self._exited.is_set()

    async def __aenter__(self):
        await self.start()
        return self

    async def stop(self):
        """This is called when exiting the TaskContext

        Two important properties that we need to maintain here:
        * Should never raise exceptions as a result
        of exceptions (incl. cancellations) in the contained tasks
        * Should not have an open-ended runtime, even if
        the contained tasks are uncooperative with cancellations.
        """
        self._exited.set()
        await asyncio.sleep(0)  # Causes any just-created tasks to get started
        unfinished_tasks = [t for t in self._tasks if not t.done()]
        gather_future = None

        try:
            if self._grace is not None and unfinished_tasks:
                gather_future = asyncio.gather(*unfinished_tasks, return_exceptions=True)
                await asyncio.wait_for(gather_future, timeout=self._grace)
        except asyncio.TimeoutError:
            pass
        finally:
            # asyncio.wait_for cancels the future, but the CancelledError
            # still needs to be handled
            # (https://stackoverflow.com/a/63356323/2475114)
            if gather_future:
                with contextlib.suppress(asyncio.CancelledError):
                    await gather_future

            cancelled_tasks: list[asyncio.Task] = []
            for task in self._tasks:
                if task.done():
                    # consume potential exceptions so we don't get warnings
                    # not that this is not supposed to reraise exceptions
                    # since those are expected to be reraised by aexit anyway
                    with contextlib.suppress(BaseException):
                        task.result()
                else:
                    # Cancel any remaining unfinished tasks.
                    task.cancel()
                    cancelled_tasks.append(task)

            cancellation_gather = asyncio.gather(*cancelled_tasks, return_exceptions=True)
            try:
                await asyncio.wait_for(cancellation_gather, timeout=self._cancellation_grace)
            except asyncio.TimeoutError:
                warnings.warn(f"Internal warning: Tasks did not cancel in a timely manner: {cancelled_tasks}")

            await asyncio.sleep(0)  # wake up coroutines waiting for cancellations

    async def __aexit__(self, exc_type, value, tb):
        """
        This is a bit involved:
        * If there is an exception within the "context", we typically always want to reraise that
        * If a cancellation comes in *during* aexit/stop execution itself, we don't actually cancel
          the exit logic (it's already performing cancellation logic of sorts), but we do reraise
          the CancelledError to prevent muting cancellation chains
        """
        stop_task = asyncio.ensure_future(self.stop())
        try:
            await asyncio.shield(stop_task)
        except asyncio.CancelledError:
            if not stop_task.done():
                # External cancellation - wait for stop() to finish, then propagate
                with contextlib.suppress(asyncio.CancelledError):
                    await stop_task  # always run stop_task to completion
            raise

    def create_task(self, coro_or_task) -> asyncio.Task:
        if isinstance(coro_or_task, asyncio.Task):
            task = coro_or_task
        elif asyncio.iscoroutine(coro_or_task):
            loop = asyncio.get_event_loop()
            task = loop.create_task(coro_or_task)
        else:
            raise Exception(f"Object of type {type(coro_or_task)} is not a coroutine or Task")
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    def infinite_loop(
        self, async_f, timeout: Optional[float] = 90, sleep: float = 10, log_exception: bool = True
    ) -> asyncio.Task:
        if isinstance(async_f, functools.partial):
            function_name = async_f.func.__qualname__
        else:
            function_name = async_f.__qualname__

        async def loop_coro() -> None:
            logger.debug(f"Starting infinite loop {function_name}")
            while not self.exited:
                try:
                    await asyncio.wait_for(async_f(), timeout=timeout)
                except Exception as exc:
                    if log_exception and isinstance(exc, asyncio.TimeoutError):
                        # Asyncio sends an empty message in this case, so let's use logger.error
                        logger.error(f"Loop attempt for {function_name} timed out")
                    elif log_exception:
                        # Propagate the exception to the logger
                        logger.exception(f"Loop attempt for {function_name} failed")
                try:
                    await asyncio.wait_for(self._exited.wait(), timeout=sleep)
                except asyncio.TimeoutError:
                    continue

            logger.debug(f"Exiting infinite loop for {function_name}")

        t = self.create_task(loop_coro())
        t.set_name(f"{function_name} loop")
        self._loops.add(t)
        t.add_done_callback(self._loops.discard)
        return t

    @staticmethod
    async def gather(*coros: Awaitable) -> Any:
        """Wait for a sequence of coroutines to finish, concurrently.

        This is similar to `asyncio.gather()`, but it uses TaskContext to cancel all remaining tasks
        if one fails with an exception other than `asyncio.CancelledError`. The native `asyncio`
        function does not cancel remaining tasks in this case, which can lead to surprises.

        For example, if you use `asyncio.gather(t1, t2, t3)` and t2 raises an exception, then t1 and
        t3 would continue running. With `TaskContext.gather(t1, t2, t3)`, they are cancelled.

        It's still useful to use `asyncio.gather()` if you don't need cancellation — for
        example, if you're just gathering quick coroutines with no side-effects. Or if you're
        gathering the tasks with `return_exceptions=True`.

        Usage:

        ```python notest
        # Example 1: Await three coroutines
        created_object, other_work, new_plumbing = await TaskContext.gather(
            create_my_object(),
            do_some_other_work(),
            fix_plumbing(),
        )

        # Example 2: Gather a list of coroutines
        coros = [a.load() for a in objects]
        results = await TaskContext.gather(*coros)
        ```
        """
        async with TaskContext() as tc:
            tasks = [tc.create_task(coro) for coro in coros]
            return await asyncio.gather(*tasks)


def run_coro_blocking(coro):
    """Fairly hacky thing that's needed in some extreme cases.

    It's basically works like asyncio.run but unlike asyncio.run it also works
    with in the case an event loop is already running. It does this by basically
    moving the whole thing to a separate thread.
    """
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        fut = executor.submit(asyncio.run, coro)
        return fut.result()


class TimestampPriorityQueue(Generic[T]):
    """
    A priority queue that schedules items to be processed at specific timestamps.
    """

    _MAX_PRIORITY = float("inf")

    def __init__(self, maxsize: int = 0):
        self.condition = asyncio.Condition()
        self._queue: asyncio.PriorityQueue[tuple[float, int, Union[T, None]]] = asyncio.PriorityQueue(maxsize=maxsize)
        # Used to tiebreak items with the same timestamp that are not comparable. (eg. protos)
        self._counter = itertools.count()

    async def close(self):
        await self.put(self._MAX_PRIORITY, None)

    async def put(self, timestamp: float, item: Union[T, None]):
        """
        Add an item to the queue to be processed at a specific timestamp.
        """
        await self._queue.put((timestamp, next(self._counter), item))
        async with self.condition:
            self.condition.notify_all()  # notify any waiting coroutines

    async def get(self) -> Union[T, None]:
        """
        Get the next item from the queue that is ready to be processed.
        """
        while True:
            async with self.condition:
                while self.empty():
                    await self.condition.wait()
                # peek at the next item
                timestamp, counter, item = await self._queue.get()
                now = time.time()
                if timestamp < now:
                    return item
                if timestamp == self._MAX_PRIORITY:
                    return None
                # not ready yet, calculate sleep time
                sleep_time = timestamp - now
                self._queue.put_nowait((timestamp, counter, item))  # put it back
                # wait until either the timeout or a new item is added
                try:
                    await asyncio.wait_for(self.condition.wait(), timeout=sleep_time)
                except asyncio.TimeoutError:
                    continue

    def empty(self) -> bool:
        return self._queue.empty()

    def qsize(self) -> int:
        return self._queue.qsize()

    async def clear(self):
        """
        Clear the retry queue. Used for testing to simulate reading all elements from queue using queue_batch_iterator.
        """
        while not self.empty():
            await self.get()

    def __len__(self):
        return self._queue.qsize()


async def queue_batch_iterator(
    q: Union[asyncio.Queue, TimestampPriorityQueue], max_batch_size=100, debounce_time=0.015
):
    """
    Read from a queue but return lists of items when queue is large

    Treats a None value as end of queue items
    """
    item_list: list[Any] = []

    while True:
        if q.empty() and len(item_list) > 0:
            yield item_list
            item_list = []
            await asyncio.sleep(debounce_time)

        res = await q.get()

        if len(item_list) >= max_batch_size:
            yield item_list
            item_list = []

        if res is None:
            if len(item_list) > 0:
                yield item_list
            break
        item_list.append(res)


class _WarnIfGeneratorIsNotConsumed:
    def __init__(self, gen, function_name: str):
        self.gen = gen
        self.function_name = function_name
        self.iterated = False
        self.warned = False
        self.__wrapped__ = gen

    def __aiter__(self):
        self.iterated = True
        return self.gen.__aiter__()

    async def __anext__(self):
        self.iterated = True
        return await self.gen.__anext__()

    async def asend(self, value):
        self.iterated = True
        return await self.gen.asend(value)

    def __repr__(self):
        return repr(self.gen)

    def __del__(self):
        if not self.iterated and not self.warned:
            self.warned = True
            logger.warning(
                f"Warning: the results of a call to {self.function_name} was not consumed, "
                "so the call will never be executed."
                f" Consider a for-loop like `for x in {self.function_name}(...)` or "
                "unpacking the generator using `list(...)`"
            )

    async def athrow(self, exc):
        return await self.gen.athrow(exc)

    async def aclose(self):
        return await self.gen.aclose()


_BlockingWarnIfGeneratorIsNotConsumed = synchronize_api(_WarnIfGeneratorIsNotConsumed)


class _WarnIfNonWrappedGeneratorIsNotConsumed(_WarnIfGeneratorIsNotConsumed):
    # used for non-synchronicity-wrapped generators and iterators
    def __iter__(self):
        self.iterated = True
        return iter(self.gen)

    def __next__(self):
        self.iterated = True
        return self.gen.__next__()

    def send(self, value):
        self.iterated = True
        return self.gen.send(value)


def warn_if_generator_is_not_consumed(function_name: Optional[str] = None):
    # https://gist.github.com/erikbern/01ae78d15f89edfa7f77e5c0a827a94d
    def decorator(gen_f):
        presented_func_name = function_name if function_name is not None else gen_f.__name__

        @functools.wraps(gen_f)
        def f_wrapped(*args, **kwargs):
            gen = gen_f(*args, **kwargs)
            if inspect.isasyncgen(gen):
                return _WarnIfGeneratorIsNotConsumed(gen, presented_func_name)
            else:
                return _WarnIfNonWrappedGeneratorIsNotConsumed(gen, presented_func_name)

        return f_wrapped

    return decorator


def run_coroutine_in_temporary_event_loop(coro: typing.Coroutine[None, None, T], nested_async_message: str) -> T:
    """Compatibility function to run an async coroutine in a temporary event loop.

    This is needed for compatibility with the async implementation of Function.spawn_map. The future plan is
    to have separate implementations so there is no issue with nested event loops.
    """
    try:
        with Runner() as runner:
            return runner.run(coro)
    except NestedEventLoops:
        raise InvalidError(nested_async_message)


class AsyncOrSyncIterable:
    """Compatibility class for non-synchronicity wrapped async iterables to get
    both async and sync interfaces in the same way that synchronicity does (but on the main thread)
    so they can be "lazily" iterated using either `for _ in x` or `async for _ in x`

    nested_async_message is raised as an InvalidError if the async variant is called
    from an already async context, since that would otherwise deadlock the event loop
    """

    def __init__(self, async_iterable: typing.AsyncGenerator[Any, None], nested_async_message):
        self._async_iterable = async_iterable
        self.nested_async_message = nested_async_message

    def __aiter__(self):
        return self._async_iterable

    def __iter__(self):
        try:
            with Runner() as runner:
                yield from run_async_gen(runner, self._async_iterable)
        except NestedEventLoops:
            raise InvalidError(self.nested_async_message)

    async def aclose(self):
        if hasattr(self._async_iterable, "aclose"):
            await self._async_iterable.aclose()


_shutdown_tasks = []


def on_shutdown(coro):
    # hook into event loop shutdown when all active tasks get cancelled
    async def wrapper():
        try:
            await asyncio.sleep(1e10)  # never awake except for exceptions
        finally:
            await coro
            raise

    _shutdown_tasks.append(asyncio.create_task(wrapper()))


def asyncify(f: Callable[P, T]) -> Callable[P, typing.Coroutine[None, None, T]]:
    """Convert a blocking function into one that runs in the current loop's executor."""

    @functools.wraps(f)
    async def wrapper(*args: P.args, **kwargs: P.kwargs):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, functools.partial(f, *args, **kwargs))

    return wrapper


async def iterate_blocking(iterator: Iterator[T]) -> AsyncGenerator[T, None]:
    """Iterate over a blocking iterator in an async context."""

    loop = asyncio.get_running_loop()
    DONE = object()
    while True:
        obj = await loop.run_in_executor(None, next, iterator, DONE)
        if obj is DONE:
            break
        yield cast(T, obj)


@asynccontextmanager
async def asyncnullcontext(*args, **kwargs):
    """Async noop context manager.

    Note that for Python 3.10+ you can use contextlib.nullcontext() instead.

    Usage:
    async with asyncnullcontext():
        pass
    """
    yield


YIELD_TYPE = typing.TypeVar("YIELD_TYPE")
SEND_TYPE = typing.TypeVar("SEND_TYPE")


def run_async_gen(
    runner: Runner,
    gen: typing.AsyncGenerator[YIELD_TYPE, SEND_TYPE],
) -> typing.Generator[YIELD_TYPE, SEND_TYPE, None]:
    """Convert an async generator into a sync one"""
    # more or less copied from synchronicity's implementation:
    next_send: typing.Union[SEND_TYPE, None] = None
    next_yield: YIELD_TYPE
    exc: Optional[BaseException] = None
    while True:
        try:
            if exc:
                next_yield = runner.run(gen.athrow(exc))
            else:
                next_yield = runner.run(gen.asend(next_send))  # type: ignore[arg-type]
        except KeyboardInterrupt as e:
            raise e from None
        except StopAsyncIteration:
            break  # typically a graceful exit of the async generator
        try:
            next_send = yield next_yield
            exc = None
        except BaseException as err:
            exc = err


class aclosing(typing.Generic[T]):  # noqa
    # backport of Python contextlib.aclosing from Python 3.10
    def __init__(self, agen: AsyncGenerator[T, None]):
        self.agen = agen

    async def __aenter__(self) -> AsyncGenerator[T, None]:
        return self.agen

    async def __aexit__(self, exc, exc_type, tb):
        await self.agen.aclose()


async def sync_or_async_iter(iter: Union[Iterable[T], AsyncIterable[T]]) -> AsyncGenerator[T, None]:
    if hasattr(iter, "__aiter__"):
        agen = typing.cast(AsyncGenerator[T, None], iter)
        try:
            async for item in agen:
                yield item
        finally:
            if hasattr(agen, "aclose"):
                # All AsyncGenerator's have an aclose method
                # but some AsyncIterable's don't necessarily
                await agen.aclose()
    else:
        assert hasattr(iter, "__iter__"), "sync_or_async_iter requires an Iterable or AsyncGenerator"
        # This intentionally could block the event loop for the duration of calling __iter__ and __next__,
        # so in non-trivial cases (like passing lists and ranges) this could be quite a foot gun for users #
        # w/ async code (but they can work around it by always using async iterators)
        for item in typing.cast(Iterable[T], iter):
            yield item


@typing.overload
def async_zip(g1: AsyncGenerator[T, None], g2: AsyncGenerator[V, None], /) -> AsyncGenerator[tuple[T, V], None]: ...


@typing.overload
def async_zip(*generators: AsyncGenerator[T, None]) -> AsyncGenerator[tuple[T, ...], None]: ...


async def async_zip(*generators):
    tasks = []
    try:
        while True:
            try:

                async def next_item(gen):
                    return await gen.__anext__()

                tasks = [asyncio.create_task(next_item(gen)) for gen in generators]
                items = await asyncio.gather(*tasks)
                yield tuple(items)
            except StopAsyncIteration:
                break
    finally:
        cancelled_tasks = []
        for task in tasks:
            if not task.done():
                task.cancel()
                cancelled_tasks.append(task)
        try:
            await asyncio.gather(*cancelled_tasks)
        except asyncio.CancelledError:
            pass

        first_exception = None
        for gen in generators:
            try:
                await gen.aclose()
            except BaseException as e:
                if first_exception is None:
                    first_exception = e
                logger.exception(f"Error closing async generator: {e}")
        if first_exception is not None:
            raise first_exception


@dataclass
class ValueWrapper(typing.Generic[T]):
    value: T


@dataclass
class ExceptionWrapper:
    value: Exception


class StopSentinelType: ...


STOP_SENTINEL = StopSentinelType()


async def async_merge(
    *generators: AsyncGenerator[T, None], cancellation_timeout: float = 10.0
) -> AsyncGenerator[T, None]:
    """
    Asynchronously merges multiple async generators into a single async generator.

    This function takes multiple async generators and yields their values in the order
    they are produced. If any generator raises an exception, the exception is propagated.

    Args:
        *generators: One or more async generators to be merged.

    Yields:
        The values produced by the input async generators.

    Raises:
        Exception: If any of the input generators raises an exception, it is propagated.

    Usage:
    ```python
    import asyncio
    from modal._utils.async_utils import async_merge

    async def gen1():
        yield 1
        yield 2

    async def gen2():
        yield "a"
        yield "b"

    async def example():
        values = set()
        async for value in async_merge(gen1(), gen2()):
            values.add(value)

        return values

    # Output could be: {1, "a", 2, "b"} (order may vary)
    values = asyncio.run(example())
    assert values == {1, "a", 2, "b"}
    ```
    """
    queue: asyncio.Queue[Union[ValueWrapper[T], ExceptionWrapper]] = asyncio.Queue(maxsize=len(generators) * 10)

    async def producer(generator: AsyncGenerator[T, None]):
        try:
            async with aclosing(generator) as stream:
                async for item in stream:
                    await queue.put(ValueWrapper(item))
        except Exception as e:
            await queue.put(ExceptionWrapper(e))

    tasks = {asyncio.create_task(producer(gen)) for gen in generators}
    new_output_task = asyncio.create_task(queue.get())

    try:
        while tasks:
            done, _ = await asyncio.wait(
                [*tasks, new_output_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            if new_output_task in done:
                item = new_output_task.result()
                if isinstance(item, ValueWrapper):
                    yield item.value
                else:
                    assert_type(item, ExceptionWrapper)
                    raise item.value

                new_output_task = asyncio.create_task(queue.get())

            finished_producers = done & tasks
            tasks -= finished_producers
            for finished_producer in finished_producers:
                # this is done in order to catch potential raised errors/cancellations
                # from within worker tasks as soon as they happen.
                await finished_producer

        while not queue.empty():
            item = await new_output_task
            if isinstance(item, ValueWrapper):
                yield item.value
            else:
                assert_type(item, ExceptionWrapper)
                raise item.value

            new_output_task = asyncio.create_task(queue.get())

    finally:
        unfinished_tasks = [t for t in tasks | {new_output_task} if not t.done()]
        for t in unfinished_tasks:
            t.cancel()
        try:
            await asyncio.wait_for(
                asyncio.shield(
                    # we need to `shield` the `gather` to ensure cooperation with the timeout
                    # all underlying tasks have been marked as cancelled at this point anyway
                    asyncio.gather(*unfinished_tasks, return_exceptions=True)
                ),
                timeout=cancellation_timeout,
            )
        except asyncio.TimeoutError:
            logger.debug("Timed out while cleaning up async_merge")


async def callable_to_agen(awaitable: Callable[[], Awaitable[T]]) -> AsyncGenerator[T, None]:
    yield await awaitable()


async def gather_cancel_on_exc(*coros_or_futures):
    input_tasks = [asyncio.ensure_future(t) for t in coros_or_futures]
    try:
        return await asyncio.gather(*input_tasks)
    except BaseException:
        for t in input_tasks:
            t.cancel()
        await asyncio.gather(*input_tasks, return_exceptions=False)  # handle cancellations
        raise


async def prevent_cancellation_abortion(coro):
    # if this is cancelled, it will wait for coro cancellation handling
    # and then unconditionally re-raises a CancelledError, even if the underlying coro
    # doesn't re-raise the cancellation itself
    t = asyncio.create_task(coro)
    try:
        return await asyncio.shield(t)
    except asyncio.CancelledError:
        if t.cancelled():
            # coro cancelled itself - reraise
            raise
        t.cancel()  # cancel task
        await t  # this *normally* reraises
        raise  # if the above somehow resolved, by swallowing cancellation - we still raise


async def async_map(
    input_generator: AsyncGenerator[T, None],
    async_mapper_func: Callable[[T], Awaitable[V]],
    concurrency: int,
    cancellation_timeout: float = 10.0,
) -> AsyncGenerator[V, None]:
    queue: asyncio.Queue[Union[ValueWrapper[T], StopSentinelType]] = asyncio.Queue(maxsize=concurrency * 2)

    async def producer() -> AsyncGenerator[V, None]:
        async with aclosing(input_generator) as stream:
            async for item in stream:
                await queue.put(ValueWrapper(item))

        for _ in range(concurrency):
            await queue.put(STOP_SENTINEL)

        if False:
            # Need it to be an async generator for async_merge
            # but we don't want to yield anything
            yield

    async def worker() -> AsyncGenerator[V, None]:
        while True:
            item = await queue.get()
            if isinstance(item, ValueWrapper):
                res = await prevent_cancellation_abortion(async_mapper_func(item.value))
                yield res
            elif isinstance(item, ExceptionWrapper):
                raise item.value
            else:
                assert_type(item, StopSentinelType)
                break

    async with aclosing(
        async_merge(*[worker() for i in range(concurrency)], producer(), cancellation_timeout=cancellation_timeout)
    ) as stream:
        async for item in stream:
            yield item


async def async_map_ordered(
    input_generator: AsyncGenerator[T, None],
    async_mapper_func: Callable[[T], Awaitable[V]],
    concurrency: int,
    buffer_size: Optional[int] = None,
) -> AsyncGenerator[V, None]:
    semaphore = asyncio.Semaphore(buffer_size or concurrency)

    async def mapper_func_wrapper(tup: tuple[int, T]) -> tuple[int, V]:
        return (tup[0], await async_mapper_func(tup[1]))

    async def counter() -> AsyncGenerator[int, None]:
        for i in itertools.count():
            await semaphore.acquire()
            yield i

    next_idx = 0
    buffer = {}

    async with aclosing(async_map(async_zip(counter(), input_generator), mapper_func_wrapper, concurrency)) as stream:
        async for output_idx, output_item in stream:
            buffer[output_idx] = output_item

            while next_idx in buffer:
                yield buffer[next_idx]
                semaphore.release()
                del buffer[next_idx]
                next_idx += 1


async def async_chain(*generators: AsyncGenerator[T, None]) -> AsyncGenerator[T, None]:
    try:
        for gen in generators:
            async for item in gen:
                yield item
    finally:
        first_exception = None
        for gen in generators:
            try:
                await gen.aclose()
            except BaseException as e:
                if first_exception is None:
                    first_exception = e
                logger.exception(f"Error closing async generator: {e}")
        if first_exception is not None:
            raise first_exception


def deprecate_aio_usage(deprecation_date: tuple[int, int, int], readable_sync_call: str):
    # Note: Currently only works on methods, not top level functions
    def deco(sync_implementation):
        if isinstance(sync_implementation, classmethod):
            sync_implementation = sync_implementation.__func__
            is_classmethod = True
        else:
            is_classmethod = False

        async def _async_proxy(*args, **kwargs):
            deprecation_warning(
                deprecation_date,
                f"""The async constructor {readable_sync_call}.aio(...) will be deprecated in a future version of Modal.
                Please use {readable_sync_call}(...) instead (it doesn't perform any IO, and is safe in async contexts)
                """,
            )
            return sync_implementation(*args, **kwargs)

        return MethodWithAio(sync_implementation, _async_proxy, synchronizer, is_classmethod=is_classmethod)

    return deco
