import typing
import weakref

if typing.TYPE_CHECKING:
    from .server import Server
    from .client import Channel

servers: 'weakref.WeakSet[Server]' = weakref.WeakSet()
channels: 'weakref.WeakSet[Channel]' = weakref.WeakSet()
