import asyncio
import atexit
import collections.abc
import concurrent
import concurrent.futures
import contextlib
import functools
import inspect
import logging
import os
import sys
import threading
import traceback
import types
import typing
import warnings
from inspect import get_annotations
from typing import Callable, ForwardRef, Optional

import typing_extensions

from synchronicity.annotations import evaluated_annotation
from synchronicity.combined_types import FunctionWithAio, MethodWithAio

from .async_wrap import is_async_gen_function_follow_wrapped, is_coroutine_function_follow_wrapped, wraps_by_interface
from .callback import Callback
from .exceptions import UserCodeException, suppress_synchronicity_tb_frames, unwrap_coro_exception, wrap_coro_exception
from .interface import DEFAULT_CLASS_PREFIX, DEFAULT_FUNCTION_PREFIXES, Interface

_BUILTIN_ASYNC_METHODS = {
    "__aiter__": "__iter__",
    "__aenter__": "__enter__",
    "__aexit__": "__exit__",
    "__anext__": "__next__",
    "aclose": "close",
}

IGNORED_ATTRIBUTES = (
    # the "zope" lib monkey patches in some non-introspectable stuff on stdlib abc.ABC.
    # Ignoring __provides__ fixes an incompatibility with `channels[daphne]`,
    # where Synchronizer creation fails when wrapping contextlib._AsyncGeneratorContextManager
    "__provides__",
    # we don't want to proxy the destructor - it should get called by the gc mechanism as soon as the wrapper is gc:ed
    # otherwise we may trigger it twice
    "__del__",
)

_RETURN_FUTURE_KWARG = "_future"

TARGET_INTERFACE_ATTR = "_sync_target_interface"
SYNCHRONIZER_ATTR = "_sync_synchronizer"


ASYNC_GENERIC_ORIGINS = (
    collections.abc.Awaitable,
    collections.abc.Coroutine,
    collections.abc.AsyncIterator,
    collections.abc.AsyncIterable,
    collections.abc.AsyncGenerator,
    contextlib.AbstractAsyncContextManager,
)


logger = logging.getLogger(__name__)


class classproperty:
    """Read-only class property recognized by Synchronizer's wrap method."""

    def __init__(self, fget):
        self.fget = fget

    def __get__(self, obj, owner):
        return self.fget(owner)


def _type_requires_aio_usage(annotation, declaration_module):
    if isinstance(annotation, ForwardRef):
        annotation = annotation.__forward_arg__
    if isinstance(annotation, str):
        try:
            annotation = evaluated_annotation(annotation, declaration_module=declaration_module)
        except Exception:
            # TODO: this will be incorrect in special case of `arg: "Awaitable[some_forward_ref_type]"`,
            #       but its a hard problem to solve without passing around globals everywhere
            return False

    if hasattr(annotation, "__origin__"):
        if annotation.__origin__ in ASYNC_GENERIC_ORIGINS:  # type: ignore
            return True
        # recurse for generic subtypes
        for a in getattr(annotation, "__args__", ()):
            if _type_requires_aio_usage(a, declaration_module):
                return True
    return False


def should_have_aio_interface(func):
    # determines if a blocking function gets an .aio attribute with an async interface to the function or not
    if is_coroutine_function_follow_wrapped(func) or is_async_gen_function_follow_wrapped(func):
        return True
    # check annotations if they contain any async entities that would need an event loop to be translated:
    # This catches things like vanilla functions returning Coroutines
    annos = get_annotations(func)
    for anno in annos.values():
        if _type_requires_aio_usage(anno, func.__module__):
            return True
    return False


class Synchronizer:
    """Helps you offer a blocking (synchronous) interface to asynchronous code."""

    def __init__(
        self,
        multiwrap_warning=False,
        async_leakage_warning=True,
        blocking_in_async_callback: Optional[Callable[[types.FunctionType], None]] = None,
    ):
        self._future_poll_interval = 0.1
        self._multiwrap_warning = multiwrap_warning
        self._async_leakage_warning = async_leakage_warning
        self._blocking_in_async_callback = blocking_in_async_callback
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._loop_creation_lock = threading.Lock()
        self._thread = None
        self._thread_exception: Optional[BaseException] = None
        self._thread_traceback: Optional[str] = None
        self._owner_pid = None
        self._stopping: Optional[asyncio.Event] = None
        self._asyncgen_finalizer_timeout_seconds = 10.0  # pretty high default to allow async finalization in most cases

        # Special attribute we use to go from wrapped <-> original
        self._wrapped_attr = "_sync_wrapped_%d" % id(self)
        self._original_attr = "_sync_original_%d" % id(self)

        # Special attribute to mark something as non-wrappable
        self._nowrap_attr = "_sync_nonwrap_%d" % id(self)
        self._input_translation_attr = "_sync_input_translation_%d" % id(self)
        self._output_translation_attr = "_sync_output_translation_%d" % id(self)

        # Prep a synchronized context manager in case one is returned and needs translation
        self._ctx_mgr_cls = contextlib._AsyncGeneratorContextManager
        self.create_blocking(self._ctx_mgr_cls)
        atexit.register(self._close_loop)

    _PICKLE_ATTRS = [
        "_multiwrap_warning",
        "_async_leakage_warning",
        "_blocking_in_async_callback",
    ]

    def __getstate__(self):
        return dict([(attr, getattr(self, attr)) for attr in self._PICKLE_ATTRS])

    def __setstate__(self, d):
        for attr in self._PICKLE_ATTRS:
            setattr(self, attr, d[attr])

    def _start_loop(self):
        with self._loop_creation_lock:
            if self._loop and self._loop.is_running():
                # in case of a race between two _start_loop, the loop might already
                # be created here by another thread
                return self._loop

            is_ready = threading.Event()

            def thread_inner():
                async def loop_inner():
                    self._loop = asyncio.get_running_loop()
                    self._stopping = asyncio.Event()
                    is_ready.set()
                    await self._stopping.wait()  # wait until told to stop

                try:
                    try:
                        asyncio.run(loop_inner())
                    except BaseException as exc_inner:
                        self._thread_exception = exc_inner
                        self._thread_traceback = traceback.format_exc()
                        raise exc_inner
                except RuntimeError as exc:
                    # Python 3.12 raises a RuntimeError when new threads are created at shutdown.
                    # Swallowing it here is innocuous, but ideally we will revisit this after
                    # refactoring the shutdown handlers that modal uses to avoid triggering it.
                    if "can't create new thread at interpreter shutdown" not in str(exc):
                        raise exc

            self._owner_pid = os.getpid()
            thread = threading.Thread(target=thread_inner, daemon=True)
            thread.start()
            is_ready.wait()  # TODO: this might block for a very short time
            self._thread = thread
            return self._loop

    def _close_loop(self):
        # Use getattr to protect against weird gc races when we get here via __del__
        if getattr(self, "_thread", None) is not None:
            if not self._loop.is_closed():
                # This also serves the purpose of waking up an idle loop
                self._loop.call_soon_threadsafe(self._stopping.set)
            self._thread.join()
            self._thread = None
            self._loop = None
            self._owner_pid = None

    def __del__(self):
        # TODO: this isn't reliably called, because self.create_blocking(self._ctx_mgr_cls)
        #  creates a global reference to this Synchronizer which makes it never get gced
        self._close_loop()

    @typing.overload
    def _get_loop(self, start: typing.Literal[True]) -> asyncio.AbstractEventLoop: ...

    @typing.overload
    def _get_loop(self, start: bool) -> typing.Union[asyncio.AbstractEventLoop, None]: ...

    def _get_loop(self, start=False) -> typing.Union[asyncio.AbstractEventLoop, None]:
        if self._thread and not self._thread.is_alive():
            if self._owner_pid == os.getpid():
                # warn - thread died without us forking
                logger.error(
                    f"""Synchronizer thread unexpectedly died.
Cause: {type(self._thread_exception)}
Traceback:{self._thread_traceback}"""
                )
                raise RuntimeError("Synchronizer thread unexpectedly died")

            self._thread = None
            self._loop = None

        if self._loop is None and start:
            return self._start_loop()
        return self._loop

    def _get_running_loop(self):
        # TODO: delete this method
        try:
            return asyncio.get_running_loop()
        except RuntimeError:
            return

    def _is_inside_loop(self):
        loop = self._get_loop()
        if loop is None:
            return False
        if threading.current_thread() != self._thread:
            # gevent does something bad that causes asyncio.get_running_loop() to return self._loop
            return False
        current_loop = self._get_running_loop()
        return loop == current_loop

    def _wrap_check_async_leakage(self, coro):
        """Check if a coroutine returns another coroutine (or an async generator) and warn.

        The reason this is important to catch is that otherwise even synchronized code might end up
        "leaking" async code into the caller.
        """
        if not self._async_leakage_warning:
            return coro

        async def coro_wrapped():
            value = await coro
            # TODO: we should include the name of the original function here
            if inspect.iscoroutine(value):
                warnings.warn(f"Potential async leakage: coroutine returned a coroutine {value}.")
            elif inspect.isasyncgen(value):
                warnings.warn(f"Potential async leakage: Coroutine returned an async generator {value}.")
            return value

        return coro_wrapped()

    def _wrap_instance(self, obj):
        # Takes an object and creates a new proxy object for it
        cls = obj.__class__
        cls_dct = cls.__dict__
        wrapper_cls = cls_dct[self._wrapped_attr][Interface.BLOCKING]
        new_obj = wrapper_cls.__new__(wrapper_cls)
        # Store a reference to the original object
        new_obj.__dict__[self._original_attr] = obj
        new_obj.__dict__[SYNCHRONIZER_ATTR] = self
        return new_obj

    def _translate_scalar_in(self, obj):
        # If it's an external object, translate it to the internal type
        if hasattr(obj, "__dict__"):
            if inspect.isclass(obj):  # TODO: functions?
                return obj.__dict__.get(self._original_attr, obj)
            else:
                return obj.__dict__.get(self._original_attr, obj)
        else:
            return obj

    def _translate_scalar_out(self, obj):
        # If it's an internal object, translate it to the external interface
        if inspect.isclass(obj):  # TODO: functions?
            cls_dct = obj.__dict__
            if self._wrapped_attr in cls_dct:
                return cls_dct[self._wrapped_attr][Interface.BLOCKING]
            else:
                return obj
        elif isinstance(obj, (typing.TypeVar, typing_extensions.ParamSpec)):
            if hasattr(obj, self._wrapped_attr):
                return getattr(obj, self._wrapped_attr)[Interface.BLOCKING]
            else:
                return obj
        else:
            cls_dct = obj.__class__.__dict__
            if self._wrapped_attr in cls_dct:
                # This is an *instance* of a synchronized class, translate its type
                return self._wrap(obj, interface=Interface.BLOCKING)
            else:
                return obj

    def _recurse_map(self, mapper, obj):
        if type(obj) == list:  # noqa: E721
            return list(self._recurse_map(mapper, item) for item in obj)
        elif type(obj) == tuple:  # noqa: E721
            return tuple(self._recurse_map(mapper, item) for item in obj)
        elif type(obj) == dict:  # noqa: E721
            return dict((key, self._recurse_map(mapper, item)) for key, item in obj.items())
        else:
            return mapper(obj)

    def _translate_in(self, obj):
        return self._recurse_map(self._translate_scalar_in, obj)

    def _translate_out(self, obj, interface=None):
        # TODO: remove deprecated interface arg - not used but needs deprecation path in case of external usage
        return self._recurse_map(lambda scalar: self._translate_scalar_out(scalar), obj)

    def _translate_coro_out(self, coro, original_func):
        async def unwrap_coro():
            res = await coro
            if getattr(original_func, self._output_translation_attr, True):
                return self._translate_out(res)
            return res

        return unwrap_coro()

    def _run_function_sync(self, coro, original_func):
        if self._is_inside_loop():
            # calling another async function of the same loop would deadlock here since
            # we are in a non-yielding sync function, so error early instead!
            raise Exception("Deadlock detected: calling a sync function from the synchronizer loop")

        if self._blocking_in_async_callback is not None:
            try:
                # Check if we're being called from within another event loop
                foreign_loop = asyncio.get_running_loop()
            except RuntimeError:
                foreign_loop = None

            if foreign_loop is not None:
                # Fire warning callback - lets libraries warn about blocking usage
                # where async equivalents exists
                self._blocking_in_async_callback(original_func)

        coro = wrap_coro_exception(coro)
        coro = self._wrap_check_async_leakage(coro)
        loop = self._get_loop(start=True)

        inner_task_fut = concurrent.futures.Future()

        async def wrapper_coro():
            # this wrapper is needed since run_coroutine_threadsafe *only* accepts coroutines
            inner_task = loop.create_task(coro)
            inner_task_fut.set_result(inner_task)  # sends the task itself to the origin thread
            return await inner_task

        fut = asyncio.run_coroutine_threadsafe(wrapper_coro(), loop)
        try:
            if sys.platform == "win32":
                while 1:
                    try:
                        # repeated poll to give Windows a chance to abort on Ctrl-C
                        value = fut.result(timeout=self._future_poll_interval)
                        break
                    except concurrent.futures.TimeoutError:
                        pass
            else:
                value = fut.result()
        except KeyboardInterrupt as exc:
            # in case there is a keyboard interrupt while we are waiting
            # we cancel the *underlying* coro_task (unlike what fut.cancel() would do)
            # and then wait for the *wrapper* coroutine to get a result back, which
            # happens after the cancellation resolves
            if inner_task_fut.done():
                inner_task: asyncio.Task = inner_task_fut.result()
                loop.call_soon_threadsafe(inner_task.cancel)
            try:
                value = fut.result()
            except concurrent.futures.CancelledError as expected_cancellation:
                # we *expect* this cancellation, but defer to the passed coro to potentially
                # intercept and treat the cancellation some other way
                expected_cancellation.__suppress_context__ = True
                raise exc  # if cancel - re-raise the original KeyboardInterrupt again

        if getattr(original_func, self._output_translation_attr, True):
            return self._translate_out(value)
        return value

    def _run_function_sync_future(self, coro, original_func):
        coro = wrap_coro_exception(coro)
        coro = self._wrap_check_async_leakage(coro)
        loop = self._get_loop(start=True)
        # For futures, we unwrap the result at this point, not in f_wrapped
        coro = unwrap_coro_exception(coro)
        coro = self._translate_coro_out(coro, original_func=original_func)
        return asyncio.run_coroutine_threadsafe(coro, loop)

    async def _run_function_async(self, coro, original_func):
        coro = wrap_coro_exception(coro)
        coro = self._wrap_check_async_leakage(coro)
        loop = self._get_loop(start=True)
        if self._is_inside_loop():
            value = await coro
        else:
            inner_task_fut = concurrent.futures.Future()

            async def wrapper_coro():
                inner_task = loop.create_task(coro)
                inner_task_fut.set_result(inner_task)  # sends the task itself to the origin thread
                return await inner_task

            c_fut = asyncio.run_coroutine_threadsafe(wrapper_coro(), loop)
            a_fut = asyncio.wrap_future(c_fut)

            shielded_task = None
            try:
                if sys.platform == "win32":
                    while 1:
                        # the loop + wait_for timeout is for windows ctrl-C compatibility since
                        # windows doesn't truly interrupt the event loop on sigint
                        try:
                            # We create a task here to prevent an anonymous task inside asyncio.wait_for that could
                            # get an unresolved timeout during cancellation handling below, resulting in a warning
                            # traceback.
                            shielded_task = asyncio.create_task(
                                asyncio.wait_for(
                                    # inner shield prevents wait_for from cancelling a_fut on timeout
                                    asyncio.shield(a_fut),
                                    timeout=self._future_poll_interval,
                                )
                            )
                            # The outer shield prevents a cancelled caller from cancelling a_fut directly
                            # so that we can instead cancel the underlying inner_task and wait for it
                            # to bubble back up as a CancelledError gracefully between threads
                            # in order to run any cancellation logic in the coroutine
                            value = await asyncio.shield(shielded_task)
                            break
                        except asyncio.TimeoutError:
                            continue
                else:
                    # The shield here prevents a cancelled caller from cancelling c_fut directly
                    # so that we can instead cancel the underlying inner_task and wait for it
                    # to be handled
                    value = await asyncio.shield(a_fut)

            except asyncio.CancelledError:
                try:
                    if a_fut.cancelled():
                        raise  # cancellation came from within c_fut
                    if inner_task_fut.done():
                        inner_task: asyncio.Task = inner_task_fut.result()
                        loop.call_soon_threadsafe(inner_task.cancel)  # cancel task on synchronizer event loop
                        # wait for cancellation logic in the underlying coro to complete
                        # this should typically raise CancelledError, but in case of either:
                        # * cancellation prevention in the coro (catching the CancelledError)
                        # * coro_task resolves before the call_soon_threadsafe above is scheduled
                        # the cancellation in a_fut would be cancelled

                        await a_fut  # wait for cancellation logic to complete - this *normally* raises CancelledError
                    raise  # re-raise the CancelledError regardless - preventing unintended cancellation aborts
                finally:
                    if shielded_task:
                        shielded_task.cancel()  # cancel the shielded task, preventing timeouts

        if getattr(original_func, self._output_translation_attr, True):
            return self._translate_out(value)
        return value

    def _run_generator_sync(self, gen, original_func):
        value, is_exc = None, False
        try:
            with suppress_synchronicity_tb_frames():
                while True:
                    try:
                        if is_exc:
                            value = self._run_function_sync(gen.athrow(value), original_func)
                        else:
                            value = self._run_function_sync(gen.asend(value), original_func)
                    except UserCodeException as uc_exc:
                        uc_exc.exc.__suppress_context__ = True
                        raise uc_exc.exc
                    except StopAsyncIteration:
                        return

                    try:
                        value = yield value
                        is_exc = False
                    except GeneratorExit:
                        # Don't athrow(GeneratorExit) into the async generator.
                        # Just stop yielding and let cleanup run.
                        raise
                    except BaseException as exc:
                        value = exc
                        is_exc = True
        finally:
            # During interpreter shutdown, blocking here can deadlock.
            if not sys.is_finalizing():
                try:
                    # Best-effort close. We use a future so we don't block indefinitely in case
                    # the event loop closing races with this code and the aclose never returns
                    aclose = gen.aclose()
                    finalization_fut: concurrent.futures.Future = self._run_function_sync_future(aclose, original_func)
                    finalization_fut.result(timeout=self._asyncgen_finalizer_timeout_seconds)
                except Exception:
                    pass

    async def _run_generator_async(self, gen, original_func):
        value, is_exc = None, False
        try:
            with suppress_synchronicity_tb_frames():
                while True:
                    try:
                        if is_exc:
                            value = await self._run_function_async(gen.athrow(value), original_func)
                        else:
                            value = await self._run_function_async(gen.asend(value), original_func)
                    except UserCodeException as uc_exc:
                        uc_exc.exc.__suppress_context__ = True
                        raise uc_exc.exc
                    except StopAsyncIteration:
                        break

                    try:
                        value = yield value
                        is_exc = False
                    except GeneratorExit:
                        # Don't athrow(GeneratorExit) into the async generator.
                        # Just stop yielding and let cleanup run.
                        raise
                    except BaseException as exc:
                        value = exc
                        is_exc = True
        finally:
            # During interpreter shutdown, blocking here can deadlock.
            if not sys.is_finalizing():
                try:
                    # Best-effort close. We use a future so we don't block indefinitely in case
                    # the event loop closing races with this code and the aclose never returns
                    close_task = asyncio.create_task(self._run_function_async(gen.aclose(), original_func))
                    await asyncio.wait_for(asyncio.shield(close_task), timeout=self._asyncgen_finalizer_timeout_seconds)
                except Exception:
                    pass

    def create_callback(self, f):
        return Callback(self, f)

    def _update_wrapper(self, f_wrapped, f, name=None, interface=None, target_module=None):
        """Very similar to functools.update_wrapper"""
        functools.update_wrapper(f_wrapped, f)
        if name is not None:
            f_wrapped.__name__ = name
            f_wrapped.__qualname__ = name
        if target_module is not None:
            f_wrapped.__module__ = target_module
        setattr(f_wrapped, SYNCHRONIZER_ATTR, self)
        setattr(f_wrapped, TARGET_INTERFACE_ATTR, interface)

    def _wrap_callable(
        self,
        f,
        interface,
        name=None,
        allow_futures=True,
        unwrap_user_excs=True,
        target_module=None,
        include_aio_interface=True,
    ):
        if hasattr(f, self._original_attr):
            if self._multiwrap_warning:
                warnings.warn(f"Function {f} is already wrapped, but getting wrapped again")
            return f

        if name is None:
            _name = DEFAULT_FUNCTION_PREFIXES[interface] + f.__name__
        else:
            _name = name

        @wraps_by_interface(interface, f)
        def f_wrapped(*args, **kwargs):
            return_future = kwargs.pop(_RETURN_FUTURE_KWARG, False)

            # If this gets called with an argument that represents an external type,
            # translate it into an internal type
            if getattr(f, self._input_translation_attr, True):
                args = self._translate_in(args)
                kwargs = self._translate_in(kwargs)

            # Call the function
            res = f(*args, **kwargs)

            # Figure out if this is a coroutine or something
            is_coroutine = inspect.iscoroutine(res)
            is_asyncgen = inspect.isasyncgen(res)

            if return_future:
                if not allow_futures:
                    raise Exception("Can not return future for this function")
                elif is_coroutine:
                    return self._run_function_sync_future(res, f)
                elif is_asyncgen:
                    raise Exception("Can not return futures for generators")
                else:
                    return res
            elif is_coroutine:
                if interface == Interface._ASYNC_WITH_BLOCKING_TYPES:
                    coro = self._run_function_async(res, f)
                    if not is_coroutine_function_follow_wrapped(f):
                        # If this is a non-async function that returns a coroutine,
                        # then this is the exit point, and we need to unwrap any
                        # wrapped exception here. Otherwise, the exit point is
                        # in async_wrap.py
                        coro = unwrap_coro_exception(coro)
                    return coro
                elif interface == Interface.BLOCKING:
                    # This is the exit point, so we need to unwrap the exception here
                    try:
                        return self._run_function_sync(res, f)
                    except StopAsyncIteration as exc:
                        # this is a special case for handling __next__ wrappers around
                        # __anext__ that raises StopAsyncIteration
                        raise StopIteration().with_traceback(exc.__traceback__)
                    except UserCodeException as uc_exc:
                        # Used to skip a frame when called from `proxy_method`.
                        if unwrap_user_excs and not (Interface.BLOCKING and include_aio_interface):
                            uc_exc.exc.__suppress_context__ = True
                            raise uc_exc.exc
                        else:
                            raise uc_exc
            elif is_asyncgen:
                # Note that the _run_generator_* functions handle their own
                # unwrapping of exceptions (this happens during yielding)
                if interface == Interface._ASYNC_WITH_BLOCKING_TYPES:
                    return self._run_generator_async(res, f)
                elif interface == Interface.BLOCKING:
                    return self._run_generator_sync(res, f)
            else:
                if inspect.isfunction(res) or isinstance(res, functools.partial):  # TODO: HACKY HACK
                    # TODO: this is needed for decorator wrappers that returns functions
                    # Maybe a bit of a hacky special case that deserves its own decorator
                    @wraps_by_interface(interface, res)
                    def f_wrapped(*args, **kwargs):
                        args = self._translate_in(args)
                        kwargs = self._translate_in(kwargs)
                        f_res = res(*args, **kwargs)
                        if getattr(f, self._output_translation_attr, True):
                            return self._translate_out(f_res)
                        else:
                            return f_res

                    return f_wrapped

                if getattr(f, self._output_translation_attr, True):
                    return self._translate_out(res, interface)
                else:
                    return res

        self._update_wrapper(f_wrapped, f, _name, interface, target_module=target_module)
        setattr(f_wrapped, self._original_attr, f)

        if interface == Interface.BLOCKING and include_aio_interface and should_have_aio_interface(f):
            # special async interface
            # this async interface returns *blocking* instances of wrapped objects, not async ones:
            async_interface = self._wrap_callable(
                f,
                interface=Interface._ASYNC_WITH_BLOCKING_TYPES,
                name=name,
                allow_futures=allow_futures,
                unwrap_user_excs=unwrap_user_excs,
                target_module=target_module,
            )
            f_wrapped = FunctionWithAio(f_wrapped, async_interface, self)
            self._update_wrapper(f_wrapped, f, _name, interface, target_module=target_module)
            setattr(f_wrapped, self._original_attr, f)

        return f_wrapped

    def _wrap_proxy_method(
        synchronizer_self,
        method,
        interface,
        allow_futures=True,
        include_aio_interface=True,
    ):
        if getattr(method, synchronizer_self._nowrap_attr, None):
            # This method is marked as non-wrappable
            return method

        wrapped_method = synchronizer_self._wrap_callable(
            method,
            interface,
            allow_futures=allow_futures,
            unwrap_user_excs=False,
        )

        @wraps_by_interface(interface, wrapped_method)
        def proxy_method(self, *args, **kwargs):
            instance = self.__dict__[synchronizer_self._original_attr]
            with suppress_synchronicity_tb_frames():
                try:
                    return wrapped_method(instance, *args, **kwargs)
                except UserCodeException as uc_exc:
                    uc_exc.exc.__suppress_context__ = True
                    raise uc_exc.exc

        if interface == Interface.BLOCKING and include_aio_interface and should_have_aio_interface(method):
            async_proxy_method = synchronizer_self._wrap_proxy_method(
                method, Interface._ASYNC_WITH_BLOCKING_TYPES, allow_futures
            )
            return MethodWithAio(proxy_method, async_proxy_method, synchronizer_self)

        return proxy_method

    def _wrap_proxy_staticmethod(self, method, interface):
        orig_function = method.__func__
        method = self._wrap_callable(orig_function, interface)
        if isinstance(method, FunctionWithAio):
            return method  # no need to wrap a FunctionWithAio in a staticmethod, as it won't get bound anyways
        return staticmethod(method)

    def _wrap_proxy_classmethod(self, orig_classmethod, interface):
        orig_func = orig_classmethod.__func__
        method = self._wrap_callable(orig_func, interface, include_aio_interface=False)

        if interface == Interface.BLOCKING and should_have_aio_interface(orig_func):
            async_method = self._wrap_callable(orig_func, Interface._ASYNC_WITH_BLOCKING_TYPES)
            return MethodWithAio(method, async_method, self, is_classmethod=True)

        return classmethod(method)

    def _wrap_proxy_property(self, prop, interface):
        kwargs = {}
        for attr in ["fget", "fset", "fdel"]:
            if getattr(prop, attr):
                func = getattr(prop, attr)
                kwargs[attr] = self._wrap_proxy_method(
                    func, interface, allow_futures=False, include_aio_interface=False
                )
        return property(**kwargs)

    def _wrap_proxy_classproperty(self, prop, interface):
        wrapped_func = self._wrap_proxy_method(prop.fget, interface, allow_futures=False, include_aio_interface=False)
        return classproperty(fget=wrapped_func)

    def _wrap_proxy_constructor(synchronizer_self, cls, interface):
        """Returns a custom __init__ for the subclass."""

        def my_init(self, *args, **kwargs):
            # Create base instance
            args = synchronizer_self._translate_in(args)
            kwargs = synchronizer_self._translate_in(kwargs)
            instance = cls(*args, **kwargs)

            # Register self as the wrapped one
            interface_instances = {interface: self}
            instance.__dict__[synchronizer_self._wrapped_attr] = interface_instances

            # Store a reference to the original object
            self.__dict__[synchronizer_self._original_attr] = instance

        synchronizer_self._update_wrapper(my_init, cls.__init__, interface=interface)
        setattr(my_init, synchronizer_self._original_attr, cls.__init__)
        return my_init

    def _wrap_class(self, cls, interface, name, target_module=None):
        new_bases = []
        for base in cls.__dict__.get("__orig_bases__", cls.__bases__):
            base_is_generic = hasattr(base, "__origin__")
            if base is object or (base_is_generic and base.__origin__ == typing.Generic):
                new_bases.append(base)  # no need to wrap these, just add them as base classes
            else:
                if base_is_generic:
                    wrapped_generic = self._wrap(base.__origin__, interface, require_already_wrapped=(name is not None))
                    new_bases.append(wrapped_generic.__class_getitem__(base.__args__))
                else:
                    new_bases.append(self._wrap(base, interface, require_already_wrapped=(name is not None)))

        bases = tuple(new_bases)
        new_dict = {self._original_attr: cls}
        if cls is not None:
            new_dict["__init__"] = self._wrap_proxy_constructor(cls, interface)

        for k, v in cls.__dict__.items():
            if k in _BUILTIN_ASYNC_METHODS:
                k_sync = _BUILTIN_ASYNC_METHODS[k]
                new_dict[k_sync] = self._wrap_proxy_method(
                    v,
                    Interface.BLOCKING,
                    allow_futures=False,
                    include_aio_interface=False,
                )
                new_dict[k] = self._wrap_proxy_method(
                    v,
                    Interface._ASYNC_WITH_BLOCKING_TYPES,
                    allow_futures=False,
                )
            elif k in ("__new__", "__init__"):
                # Skip custom constructor in the wrapped class
                # Instead, delegate to the base class constructor and wrap it
                pass
            elif k in IGNORED_ATTRIBUTES:
                pass
            elif isinstance(v, staticmethod):
                # TODO(erikbern): this feels pretty hacky
                new_dict[k] = self._wrap_proxy_staticmethod(v, Interface.BLOCKING)
            elif isinstance(v, classmethod):
                new_dict[k] = self._wrap_proxy_classmethod(v, Interface.BLOCKING)
            elif isinstance(v, property):
                new_dict[k] = self._wrap_proxy_property(v, Interface.BLOCKING)
            elif isinstance(v, classproperty):
                new_dict[k] = self._wrap_proxy_classproperty(v, Interface.BLOCKING)
            elif isinstance(v, MethodWithAio):
                # if library defines its own MethodWithAio descriptor we transfer it "as is" to the wrapper
                # without wrapping it again
                new_dict[k] = v
            elif callable(v):
                new_dict[k] = self._wrap_proxy_method(v, Interface.BLOCKING)

        if name is None:
            name = DEFAULT_CLASS_PREFIX + cls.__name__

        new_cls = types.new_class(name, bases, exec_body=lambda ns: ns.update(new_dict))
        new_cls.__module__ = cls.__module__ if target_module is None else target_module
        new_cls.__doc__ = cls.__doc__
        if "__annotations__" in cls.__dict__:
            new_cls.__annotations__ = cls.__annotations__  # transfer annotations
        if "__annotate_func__" in cls.__dict__:
            new_cls.__annotate_func__ = cls.__annotate_func__  # transfer annotate func

        setattr(new_cls, SYNCHRONIZER_ATTR, self)
        return new_cls

    def _wrap(
        self,
        obj,
        interface,
        name=None,
        require_already_wrapped=False,
        target_module=None,
    ):
        # This method works for classes, functions, and instances
        # It wraps the object, and caches the wrapped object

        # Get the list of existing interfaces
        if hasattr(obj, "__dict__"):
            if self._wrapped_attr not in obj.__dict__:
                if isinstance(obj.__dict__, dict):
                    # This works for instances
                    obj.__dict__.setdefault(self._wrapped_attr, {})
                else:
                    # This works for classes & functions
                    setattr(obj, self._wrapped_attr, {})
            interfaces = obj.__dict__[self._wrapped_attr]
        else:
            # e.g., TypeVar in Python>=3.12
            if not hasattr(obj, self._wrapped_attr):
                setattr(obj, self._wrapped_attr, {})
            interfaces = getattr(obj, self._wrapped_attr)

        # If this is already wrapped, return the existing interface
        if interface in interfaces:
            if self._multiwrap_warning:
                warnings.warn(f"Object {obj} is already wrapped, but getting wrapped again")
            return interfaces[interface]

        if require_already_wrapped:
            # This happens if a class has a custom name but its base class doesn't
            raise RuntimeError(f"{obj} needs to be serialized explicitly with a custom name")

        # Wrap object (different cases based on the type)
        if inspect.isclass(obj):
            new_obj = self._wrap_class(
                obj,
                interface,
                name,
                target_module=target_module,
            )
        elif inspect.isfunction(obj):
            new_obj = self._wrap_callable(obj, interface, name, target_module=target_module)
        elif isinstance(obj, typing_extensions.ParamSpec):
            new_obj = self._wrap_param_spec(obj, interface, name, target_module)
        elif isinstance(obj, typing.TypeVar):
            new_obj = self._wrap_type_var(obj, interface, name, target_module)
        elif self._wrapped_attr in obj.__class__.__dict__:
            new_obj = self._wrap_instance(obj)
        else:
            raise Exception("Argument %s is not a class or a callable" % obj)

        # Store the interface on the obj and return
        interfaces[interface] = new_obj
        return new_obj

    def _wrap_type_var(self, obj, interface, name, target_module):
        # TypeVar translation is needed only for type stub generation, in case the
        # "bound" attribute refers to a translatable type.

        # Creates a new identical TypeVar, marked with synchronicity's special attributes
        # This lets type stubs "translate" the `bounds` attribute on emitted type vars
        # if picked up from module scope and in generics using the base implementation type

        # TODO(elias): Refactor - since this isn't used for live apps, move type stub generation into genstub
        new_obj = typing.TypeVar(name, bound=obj.__bound__)  # noqa
        setattr(new_obj, self._original_attr, obj)
        setattr(new_obj, SYNCHRONIZER_ATTR, self)
        setattr(new_obj, TARGET_INTERFACE_ATTR, interface)
        new_obj.__module__ = target_module
        if not hasattr(obj, self._wrapped_attr):
            setattr(obj, self._wrapped_attr, {})
        getattr(obj, self._wrapped_attr)[interface] = new_obj
        return new_obj

    def _wrap_param_spec(self, obj, interface, name, target_module):
        # TODO(elias): Refactor - since this isn't used for live apps, move type stub generation into genstub
        new_obj = typing_extensions.ParamSpec(name)  # noqa
        setattr(new_obj, self._original_attr, obj)
        setattr(new_obj, SYNCHRONIZER_ATTR, self)
        setattr(new_obj, TARGET_INTERFACE_ATTR, interface)
        new_obj.__module__ = target_module
        if not hasattr(obj, self._wrapped_attr):
            setattr(obj, self._wrapped_attr, {})
        getattr(obj, self._wrapped_attr)[interface] = new_obj
        return new_obj

    def nowrap(self, obj):
        setattr(obj, self._nowrap_attr, True)
        return obj

    def no_input_translation(self, obj):
        setattr(obj, self._input_translation_attr, False)
        return obj

    def no_output_translation(self, obj):
        setattr(obj, self._output_translation_attr, False)
        return obj

    def no_io_translation(self, obj):
        return self.no_input_translation(self.no_output_translation(obj))

    # New interface that (almost) doesn't mutate objects
    def create_blocking(self, obj, name: Optional[str] = None, target_module: Optional[str] = None):
        # TODO: deprecate this alias method
        return self.wrap(obj, name, target_module)

    def wrap(self, obj, name: Optional[str] = None, target_module: Optional[str] = None):
        wrapped = self._wrap(obj, Interface.BLOCKING, name, target_module=target_module)
        return wrapped

    def is_synchronized(self, obj):
        if inspect.isclass(obj) or inspect.isfunction(obj):
            return hasattr(obj, self._original_attr)
        else:
            return hasattr(obj.__class__, self._original_attr)
