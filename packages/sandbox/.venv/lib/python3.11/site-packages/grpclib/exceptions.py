from typing import Optional, Any

from .const import Status


class GRPCError(Exception):
    """Expected error, may be raised during RPC call

    There can be multiple origins of this error. It can be generated
    on the server-side and on the client-side. If this error originates from
    the server, on the wire this error is represented as ``grpc-status`` and
    ``grpc-message`` trailers. Possible values of the ``grpc-status`` trailer
    are described in the gRPC protocol definition. In ``grpclib`` these values
    are represented as :py:class:`~grpclib.const.Status` enum.

    Here are possible origins of this error:

      - you may raise this error to cancel current call on the server-side or
        return non-OK :py:class:`~grpclib.const.Status` using
        :py:meth:`~grpclib.server.Stream.send_trailing_metadata` method
        `(e.g. resource not found)`
      - server may return non-OK ``grpc-status`` in different failure
        conditions `(e.g. invalid request)`
      - client raises this error for non-OK ``grpc-status`` from the server
      - client may raise this error in different failure conditions
        `(e.g. server returned unsupported` ``:content-type`` `header)`

    """
    def __init__(
        self,
        status: Status,
        message: Optional[str] = None,
        details: Any = None,
    ) -> None:
        super().__init__(status, message, details)
        #: :py:class:`~grpclib.const.Status` of the error
        self.status = status
        #: Error message
        self.message = message
        #: Error details
        self.details = details


class ProtocolError(Exception):
    """Unexpected error, raised by ``grpclib`` when your code violates
    gRPC protocol

    This error means that you probably should fix your code.
    """


class StreamTerminatedError(Exception):
    """Unexpected error, raised when we receive ``RST_STREAM`` frame from
    the other side

    This error means that the other side decided to forcefully cancel current
    call, probably because of a protocol error.
    """
