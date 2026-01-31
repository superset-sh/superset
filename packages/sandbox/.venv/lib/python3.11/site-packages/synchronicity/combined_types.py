import functools
import typing

import typing_extensions

from synchronicity.async_wrap import wraps_by_interface
from synchronicity.exceptions import UserCodeException, suppress_synchronicity_tb_frames
from synchronicity.interface import Interface

if typing.TYPE_CHECKING:
    from synchronicity.synchronizer import Synchronizer


class FunctionWithAio:
    def __init__(self, func, aio_func, synchronizer):
        self._func = func
        self.aio = self._aio_func = aio_func
        self._synchronizer = synchronizer

    def __call__(self, *args, **kwargs):
        # .__call__ is special - it's being looked up on the class instead of the instance when calling something,
        # so setting the magic method from the constructor is not possible
        # https://stackoverflow.com/questions/22390532/object-is-not-callable-after-adding-call-method-to-instance
        # so we need to use an explicit wrapper function here
        with suppress_synchronicity_tb_frames():
            try:
                return self._func(*args, **kwargs)
            except UserCodeException as uc_exc:
                # For Python < 3.11 we use UserCodeException as an exception wrapper
                # to remove some internal frames from tracebacks, but it can't remove
                # all frames
                uc_exc.exc.__suppress_context__ = True
                raise uc_exc.exc


class MethodWithAio:
    """Creates a bound method that can have callable child-properties on the method itself.

    Child-properties are also bound to the parent instance.
    """

    def __init__(self, func, aio_func, synchronizer: "Synchronizer", is_classmethod=False):
        self._func = func
        self._aio_func = aio_func
        self._synchronizer = synchronizer
        self._is_classmethod = is_classmethod

    def __get__(self, instance, owner=None):
        bind_var = instance if instance is not None and not self._is_classmethod else owner

        bound_func = functools.wraps(self._func)(functools.partial(self._func, bind_var))  # bound blocking function
        self._synchronizer._update_wrapper(bound_func, self._func, interface=Interface.BLOCKING)

        bound_aio_func = wraps_by_interface(Interface._ASYNC_WITH_BLOCKING_TYPES, self._aio_func)(
            functools.partial(self._aio_func, bind_var)
        )  # bound async function
        self._synchronizer._update_wrapper(bound_func, self._func, interface=Interface._ASYNC_WITH_BLOCKING_TYPES)
        bound_func.aio = bound_aio_func
        return bound_func


CTX = typing.TypeVar("CTX", covariant=True)


class AsyncAndBlockingContextManager(typing_extensions.Protocol[CTX]):
    def __enter__(self) -> CTX: ...

    async def __aenter__(self) -> CTX: ...

    def __exit__(self, typ, value, tb): ...

    async def __aexit__(self, typ, value, tb): ...
