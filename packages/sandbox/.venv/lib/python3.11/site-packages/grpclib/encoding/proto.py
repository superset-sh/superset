from typing import TYPE_CHECKING, Type, Optional, Sequence, Any

from ..const import Status
from ..utils import _cached

from .base import CodecBase, StatusDetailsCodecBase


if TYPE_CHECKING:
    from google.protobuf.message import Message  # noqa
    from .._typing import IProtoMessage  # noqa


@_cached
def _status_pb2() -> Any:
    from google.rpc import status_pb2
    return status_pb2


@_cached
def _sym_db() -> Any:
    from google.protobuf.symbol_database import Default
    return Default()


@_cached
def _googleapis_available() -> bool:
    try:
        import google.rpc.status_pb2  # noqa
    except ImportError:
        return False
    else:
        return True


class ProtoCodec(CodecBase):
    __content_subtype__ = 'proto'

    def encode(
        self,
        message: 'IProtoMessage',
        message_type: Type['IProtoMessage'],
    ) -> bytes:
        if not isinstance(message, message_type):
            raise TypeError('Message must be of type {!r}, not {!r}'
                            .format(message_type, type(message)))
        return message.SerializeToString()

    def decode(
        self,
        data: bytes,
        message_type: Type['IProtoMessage'],
    ) -> 'IProtoMessage':
        return message_type.FromString(data)


class _Unknown:

    def __init__(self, name: str) -> None:
        self._name = name

    def __repr__(self) -> str:
        return 'Unknown({!r})'.format(self._name)


class ProtoStatusDetailsCodec(StatusDetailsCodecBase):

    def encode(
        self,
        status: Status,
        message: Optional[str],
        details: Sequence['Message'],
    ) -> bytes:
        status_pb2 = _status_pb2()

        status_proto = status_pb2.Status(code=status.value, message=message)
        if details is not None:
            for detail in details:
                detail_container = status_proto.details.add()
                detail_container.Pack(detail)
        return status_proto.SerializeToString()  # type: ignore

    def decode(
        self, status: Status, message: Optional[str], data: bytes,
    ) -> Sequence[Any]:
        status_pb2 = _status_pb2()
        sym_db = _sym_db()

        status_proto = status_pb2.Status.FromString(data)
        details = []
        for detail_container in status_proto.details:
            try:
                msg_type = sym_db.GetSymbol(detail_container.TypeName())
            except KeyError:
                details.append(_Unknown(detail_container.TypeName()))
                continue
            detail = msg_type()
            detail_container.Unpack(detail)
            details.append(detail)
        return details
