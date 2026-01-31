from typing import Mapping, Any
from typing_extensions import Protocol

from . import const
from . import server


class IServable(Protocol):
    def __mapping__(self) -> Mapping[str, const.Handler]: ...


class ICheckable(Protocol):
    def __mapping__(self) -> Mapping[str, Any]: ...


class IClosable(Protocol):
    def close(self) -> None: ...


class IProtoMessage(Protocol):
    @classmethod
    def FromString(cls, s: bytes) -> 'IProtoMessage': ...

    def SerializeToString(self) -> bytes: ...


class IEventsTarget(Protocol):
    __dispatch__: Any  # FIXME: should be events._Dispatch


class IServerMethodFunc(Protocol):
    async def __call__(self, stream: 'server.Stream[Any, Any]') -> None: ...


class IReleaseStream(Protocol):
    def __call__(self) -> None: ...
