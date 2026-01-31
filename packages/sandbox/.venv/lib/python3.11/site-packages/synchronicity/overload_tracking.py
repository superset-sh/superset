"""Utility for monkey patching typing.overload to allow run time retrieval overloads

Requires any @typing.overload to happen within the patched_overload contextmanager, e.g.:

```python
with patched_overload():
    # the following could be imported from some other module (as long as it wasn't already loaded), or inlined:

    @typing.overload
    def foo(a: int) -> float:
        ...

    def foo(a: typing.Union[bool, int]) -> typing.Union[bool, float]:
        if isinstance(a, bool):
            return a
        return float(a)

# returns reference to the overloads of foo (the int -> float one in this case)
# in the order they are declared
foo_overloads = get_overloads(foo)
"""

import contextlib
import typing
from unittest import mock

overloads: typing.Dict[typing.Tuple[str, str], typing.List] = {}
original_overload = typing.overload


class Untrackable(Exception):
    pass


def _function_locator(f):
    if isinstance(f, (staticmethod, classmethod)):
        return _function_locator(f.__func__)

    try:
        return (f.__module__, f.__qualname__)
    except AttributeError:
        raise Untrackable()  # TODO(elias): handle descriptors like classmethod


def _tracking_overload(f):
    # hacky thing to track all typing.overload declarations
    global overloads, original_overload
    try:
        locator = _function_locator(f)
        overloads.setdefault(locator, []).append(f)
    except Untrackable:
        print(f"WARNING: can't track overloads for {f}")

    return original_overload(f)


@contextlib.contextmanager
def patched_overload():
    with mock.patch("typing.overload", _tracking_overload):
        yield


def get_overloads(f) -> typing.List:
    try:
        return overloads.get(_function_locator(f), [])
    except Untrackable:
        return []
