from ..const import Status
from ..server import Stream
from ..exceptions import GRPCError

from .v1.channelz_pb2 import GetTopChannelsRequest, GetTopChannelsResponse
from .v1.channelz_pb2 import GetServersRequest, GetServersResponse
from .v1.channelz_pb2 import GetServerRequest, GetServerResponse
from .v1.channelz_pb2 import GetServerSocketsRequest, GetServerSocketsResponse
from .v1.channelz_pb2 import GetChannelRequest, GetChannelResponse
from .v1.channelz_pb2 import GetSubchannelRequest, GetSubchannelResponse
from .v1.channelz_pb2 import GetSocketRequest, GetSocketResponse
from .v1.channelz_grpc import ChannelzBase


class Channelz(ChannelzBase):

    async def GetTopChannels(
        self, stream: 'Stream[GetTopChannelsRequest, GetTopChannelsResponse]',
    ) -> None:
        raise GRPCError(Status.UNIMPLEMENTED)

    async def GetServers(
        self, stream: 'Stream[GetServersRequest, GetServersResponse]',
    ) -> None:
        raise GRPCError(Status.UNIMPLEMENTED)

    async def GetServer(
        self, stream: 'Stream[GetServerRequest, GetServerResponse]',
    ) -> None:
        raise GRPCError(Status.UNIMPLEMENTED)

    async def GetServerSockets(
        self,
        stream: 'Stream[GetServerSocketsRequest, GetServerSocketsResponse]',
    ) -> None:
        raise GRPCError(Status.UNIMPLEMENTED)

    async def GetChannel(
        self, stream: 'Stream[GetChannelRequest, GetChannelResponse]',
    ) -> None:
        raise GRPCError(Status.UNIMPLEMENTED)

    async def GetSubchannel(
        self, stream: 'Stream[GetSubchannelRequest, GetSubchannelResponse]',
    ) -> None:
        raise GRPCError(Status.UNIMPLEMENTED)

    async def GetSocket(
        self, stream: 'Stream[GetSocketRequest, GetSocketResponse]',
    ) -> None:
        raise GRPCError(Status.UNIMPLEMENTED)
