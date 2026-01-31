from typing import TYPE_CHECKING, Type, TypeVar, Tuple, FrozenSet, Dict
from typing import Optional, Callable, Any, Collection, List, Coroutine
from itertools import chain
from collections import defaultdict

from .const import Status
from .metadata import Deadline, _Metadata
from ._compat import get_annotations


if TYPE_CHECKING:
    from .stream import _SendType, _RecvType
    from ._typing import IEventsTarget, IServerMethodFunc  # noqa
    from .protocol import Peer


class _Event:
    __slots__ = ('__interrupted__',)
    __payload__: Collection[str] = ()
    __readonly__: FrozenSet[str] = frozenset()
    __interrupted__: bool

    def __init__(self, **kwargs):  # type: ignore
        assert len(kwargs) == len(self.__slots__), self.__slots__
        super().__setattr__('__interrupted__', False)
        for key, value in kwargs.items():
            super().__setattr__(key, value)

    def __setattr__(self, key: str, value: Any) -> None:
        if key in self.__readonly__:
            raise AttributeError('Read-only property: {!r}'.format(key))
        else:
            super().__setattr__(key, value)

    def interrupt(self) -> None:
        super().__setattr__('__interrupted__', True)


_EventType = TypeVar('_EventType', bound=_Event)


class _EventMeta(type):

    def __new__(mcs, name, bases, params):  # type: ignore
        annotations = get_annotations(params)
        payload = params.get('__payload__') or ()
        params['__slots__'] = tuple(name for name in annotations)
        params['__readonly__'] = frozenset(name for name in annotations
                                           if name not in payload)
        return super().__new__(mcs, name, bases, params)


async def _ident(*args, **_):  # type: ignore
    return args


def _dispatches(event_type: Type[_Event]) -> Callable[[Any], Any]:
    def decorator(func: Any) -> Any:
        func.__dispatches__ = event_type
        return func
    return decorator


_Callback = Callable[[_Event], Coroutine[Any, Any, None]]


class _Dispatch:
    __dispatch_methods__: Dict[Type[_Event], str] = {}

    def __init__(self) -> None:
        self._listeners: Dict[Type[_Event], List[_Callback]] = defaultdict(list)
        for name in self.__dispatch_methods__.values():
            self.__dict__[name] = _ident

    def add_listener(
        self,
        event_type: Type[_Event],
        callback: _Callback,
    ) -> None:
        self.__dict__.pop(self.__dispatch_methods__[event_type], None)
        self._listeners[event_type].append(callback)

    async def __dispatch__(self, event: _Event) -> Any:
        for callback in self._listeners[event.__class__]:
            await callback(event)
            if event.__interrupted__:
                break
        return tuple(getattr(event, name) for name in event.__payload__)


class _DispatchMeta(type):

    def __new__(mcs, name, bases, params):  # type: ignore
        dispatch_methods = dict(chain.from_iterable(
            getattr(base, '__dispatch_methods__', {}).items()
            for base in bases
        ))
        for key, value in params.items():
            dispatches = getattr(value, '__dispatches__', None)
            if dispatches is not None:
                assert (isinstance(dispatches, type)
                        and issubclass(dispatches, _Event)), dispatches
                assert dispatches not in dispatch_methods, dispatches
                dispatch_methods[dispatches] = key
        params['__dispatch_methods__'] = dispatch_methods
        return super().__new__(mcs, name, bases, params)


def listen(
    target: 'IEventsTarget',
    event_type: Type[_EventType],
    callback: Callable[[_EventType], Coroutine[Any, Any, None]],
) -> None:
    """Registers a listener function for the given target and event type

    .. code-block:: python3

        async def callback(event: SomeEvent):
            print(event.data)

        listen(target, SomeEvent, callback)
    """
    target.__dispatch__.add_listener(event_type, callback)


class SendMessage(_Event, metaclass=_EventMeta):
    """Dispatches before sending message to the other party

    :param mutable message: message to send
    """
    __payload__ = ('message',)

    message: Any


class RecvMessage(_Event, metaclass=_EventMeta):
    """Dispatches after message was received from the other party

    :param mutable message: received message
    """
    __payload__ = ('message',)

    message: Any


class _DispatchCommonEvents(_Dispatch, metaclass=_DispatchMeta):

    @_dispatches(SendMessage)
    async def send_message(self, message: '_SendType') -> Tuple['_SendType']:
        return await self.__dispatch__(SendMessage(  # type: ignore
            message=message,
        ))

    @_dispatches(RecvMessage)
    async def recv_message(self, message: '_RecvType') -> Tuple['_RecvType']:
        return await self.__dispatch__(RecvMessage(  # type: ignore
            message=message,
        ))


class RecvRequest(_Event, metaclass=_EventMeta):
    """Dispatches after request was received from the client

    :param mutable metadata: invocation metadata
    :param mutable method_func: coroutine function to process this request,
        accepts :py:class:`~grpclib.server.Stream`
    :param read-only method_name: RPC's method name
    :param read-only deadline: request's :py:class:`~grpclib.metadata.Deadline`
    :param read-only content_type: request's content type
    :param read-only user_agent: request's user agent
    :param read-only peer: request's :py:class:`~grpclib.protocol.Peer`
    """
    __payload__ = ('metadata', 'method_func')

    metadata: _Metadata
    method_func: 'IServerMethodFunc'
    method_name: str
    deadline: Optional[Deadline]
    content_type: str
    user_agent: Optional[str]
    peer: 'Peer'


class SendInitialMetadata(_Event, metaclass=_EventMeta):
    """Dispatches before sending headers with initial metadata to the client

    :param mutable metadata: initial metadata
    """
    __payload__ = ('metadata',)

    metadata: _Metadata


class SendTrailingMetadata(_Event, metaclass=_EventMeta):
    """Dispatches before sending trailers with trailing metadata to the client

    :param mutable metadata: trailing metadata
    :param read-only status: status of the RPC call
    :param read-only status_message: description of the status
    :param read-only status_details: additional status details
    """
    __payload__ = ('metadata',)

    metadata: _Metadata
    status: Status
    status_message: Optional[str]
    status_details: Any


class _DispatchServerEvents(_DispatchCommonEvents):

    @_dispatches(RecvRequest)
    async def recv_request(
        self,
        metadata: _Metadata,
        method_func: 'IServerMethodFunc',
        *,
        method_name: str,
        deadline: Optional[Deadline],
        content_type: str,
        user_agent: Optional[str],
        peer: 'Peer',
    ) -> Tuple[_Metadata, 'IServerMethodFunc']:
        return await self.__dispatch__(RecvRequest(  # type: ignore
            metadata=metadata,
            method_func=method_func,
            method_name=method_name,
            deadline=deadline,
            content_type=content_type,
            user_agent=user_agent,
            peer=peer,
        ))

    @_dispatches(SendInitialMetadata)
    async def send_initial_metadata(
        self,
        metadata: _Metadata,
    ) -> Tuple[_Metadata]:
        return await self.__dispatch__(SendInitialMetadata(  # type: ignore
            metadata=metadata,
        ))

    @_dispatches(SendTrailingMetadata)
    async def send_trailing_metadata(
        self,
        metadata: _Metadata,
        *,
        status: Status,
        status_message: Optional[str],
        status_details: Any,
    ) -> Tuple[_Metadata]:
        return await self.__dispatch__(SendTrailingMetadata(  # type: ignore
            metadata=metadata,
            status=status,
            status_message=status_message,
            status_details=status_details,
        ))


class SendRequest(_Event, metaclass=_EventMeta):
    """Dispatches before sending request to the server

    :param mutable metadata: invocation metadata
    :param read-only method_name: RPC's method name
    :param read-only deadline: request's :py:class:`~grpclib.metadata.Deadline`
    :param read-only content_type: request's content type
    """
    __payload__ = ('metadata',)

    metadata: _Metadata
    method_name: str
    deadline: Optional[Deadline]
    content_type: str


class RecvInitialMetadata(_Event, metaclass=_EventMeta):
    """Dispatches after headers with initial metadata were received
    from the server

    :param mutable metadata: initial metadata
    """
    __payload__ = ('metadata',)

    metadata: _Metadata


class RecvTrailingMetadata(_Event, metaclass=_EventMeta):
    """Dispatches after trailers with trailing metadata were received
    from the server

    :param mutable metadata: trailing metadata
    :param read-only status: status of the RPC call
    :param read-only status_message: description of the status
    :param read-only status_details: additional status details
    """
    __payload__ = ('metadata',)

    metadata: _Metadata
    status: Status
    status_message: Optional[str]
    status_details: Any


class _DispatchChannelEvents(_DispatchCommonEvents):

    @_dispatches(SendRequest)
    async def send_request(
        self,
        metadata: _Metadata,
        *,
        method_name: str,
        deadline: Optional[Deadline],
        content_type: str,
    ) -> Tuple[_Metadata]:
        return await self.__dispatch__(SendRequest(  # type: ignore
            metadata=metadata,
            method_name=method_name,
            deadline=deadline,
            content_type=content_type,
        ))

    @_dispatches(RecvInitialMetadata)
    async def recv_initial_metadata(
        self,
        metadata: _Metadata,
    ) -> Tuple[_Metadata]:
        return await self.__dispatch__(RecvInitialMetadata(  # type: ignore
            metadata=metadata,
        ))

    @_dispatches(RecvTrailingMetadata)
    async def recv_trailing_metadata(
        self,
        metadata: _Metadata,
        *,
        status: Status,
        status_message: Optional[str],
        status_details: Any,
    ) -> Tuple[_Metadata]:
        return await self.__dispatch__(RecvTrailingMetadata(  # type: ignore
            metadata=metadata,
            status=status,
            status_message=status_message,
            status_details=status_details,
        ))
