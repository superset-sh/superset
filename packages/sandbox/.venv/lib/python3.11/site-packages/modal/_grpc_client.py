# Copyright Modal Labs 2025
from typing import TYPE_CHECKING, Any, Collection, Generic, Literal, Mapping, Optional, TypeVar, Union, overload

import grpclib.client
from google.protobuf.message import Message
from grpclib import GRPCError, Status

from . import exception
from ._traceback import suppress_tb_frame
from ._utils.grpc_utils import Retry, _retry_transient_errors
from .config import config, logger

if TYPE_CHECKING:
    from .client import _Client


_Value = Union[str, bytes]
_MetadataLike = Union[Mapping[str, _Value], Collection[tuple[str, _Value]]]
RequestType = TypeVar("RequestType", bound=Message)
ResponseType = TypeVar("ResponseType", bound=Message)


class WrappedGRPCError(exception.Error, exception._GRPCErrorWrapper): ...


_STATUS_TO_EXCEPTION: dict[Status, type[exception._GRPCErrorWrapper]] = {
    Status.CANCELLED: exception.ServiceError,
    Status.UNKNOWN: exception.ServiceError,
    Status.INVALID_ARGUMENT: exception.InvalidError,
    Status.DEADLINE_EXCEEDED: exception.ServiceError,
    Status.NOT_FOUND: exception.NotFoundError,
    Status.ALREADY_EXISTS: exception.AlreadyExistsError,
    Status.PERMISSION_DENIED: exception.PermissionDeniedError,
    Status.RESOURCE_EXHAUSTED: exception.ResourceExhaustedError,
    Status.FAILED_PRECONDITION: exception.ConflictError,
    Status.ABORTED: exception.ConflictError,
    Status.OUT_OF_RANGE: exception.InvalidError,
    Status.UNIMPLEMENTED: exception.UnimplementedError,
    Status.INTERNAL: exception.InternalError,
    Status.UNAVAILABLE: exception.ServiceError,
    Status.DATA_LOSS: exception.DataLossError,
    Status.UNAUTHENTICATED: exception.AuthError,
}


class grpc_error_converter:
    def __enter__(self):
        pass

    def __exit__(self, exc_type, exc, traceback) -> Literal[False]:
        # skip all internal frames from grpclib
        use_full_traceback = config.get("traceback")
        with suppress_tb_frame():
            if isinstance(exc, GRPCError):
                modal_exc = _STATUS_TO_EXCEPTION[exc.status](exc.message)
                modal_exc._grpc_message = exc.message
                modal_exc._grpc_status = exc.status
                modal_exc._grpc_details = exc.details
                if use_full_traceback:
                    raise modal_exc
                else:
                    raise modal_exc from None  # from None to skip the grpc-internal cause

        return False


_DEFAULT_RETRY = Retry()


class UnaryUnaryWrapper(Generic[RequestType, ResponseType]):
    # Calls a grpclib.UnaryUnaryMethod using a specific Client instance, respecting
    # if that client is closed etc. and possibly introducing Modal-specific retry logic
    wrapped_method: grpclib.client.UnaryUnaryMethod[RequestType, ResponseType]
    client: "_Client"

    def __init__(
        self,
        wrapped_method: grpclib.client.UnaryUnaryMethod[RequestType, ResponseType],
        client: "_Client",
        server_url: str,
    ):
        self.wrapped_method = wrapped_method
        self.client = client
        self.server_url = server_url

    @property
    def name(self) -> str:
        return self.wrapped_method.name

    @overload
    async def __call__(
        self,
        req: RequestType,
        *,
        retry: Retry = _DEFAULT_RETRY,
        timeout: None = None,
        metadata: Optional[list[tuple[str, str]]] = None,
    ) -> ResponseType: ...

    @overload
    async def __call__(
        self,
        req: RequestType,
        *,
        retry: None,
        timeout: Optional[float] = None,
        metadata: Optional[list[tuple[str, str]]] = None,
    ) -> ResponseType: ...

    async def __call__(
        self,
        req: RequestType,
        *,
        retry: Optional[Retry] = _DEFAULT_RETRY,
        timeout: Optional[float] = None,
        metadata: Optional[list[tuple[str, str]]] = None,
    ) -> ResponseType:
        with suppress_tb_frame():
            if timeout is not None and retry is not None:
                raise exception.InvalidError("Retry must be None when timeout is set")

            if retry is None:
                with grpc_error_converter():
                    return await self.direct(req, timeout=timeout, metadata=metadata)

            # TODO do we need suppress_error_frames(1) here too?
            with grpc_error_converter():
                return await _retry_transient_errors(
                    self,  # type: ignore
                    req,
                    retry=retry,
                    metadata=metadata,
                )

    async def direct(
        self,
        req: RequestType,
        *,
        timeout: Optional[float] = None,
        metadata: Optional[_MetadataLike] = None,
    ) -> ResponseType:
        from .client import _Client

        if self.client._snapshotted:
            logger.debug(f"refreshing client after snapshot for {self.name.rsplit('/', 1)[1]}")
            self.client = await _Client.from_env()

        # Note: We override the grpclib method's channel (see grpclib's code [1]). I think this is fine
        # since grpclib's code doesn't seem to change very much, but we could also recreate the
        # grpclib stub if we aren't comfortable with this. The downside is then we need to cache
        # the grpclib stub so the rest of our code becomes a bit more complicated.
        #
        # We need to override the channel because after the process is forked or the client is
        # snapshotted, the existing channel may be stale / unusable.
        #
        # [1]: https://github.com/vmagamedov/grpclib/blob/62f968a4c84e3f64e6966097574ff0a59969ea9b/grpclib/client.py#L844
        self.wrapped_method.channel = await self.client._get_channel(self.server_url)
        return await self.client._call_unary(self.wrapped_method, req, timeout=timeout, metadata=metadata)


class UnaryStreamWrapper(Generic[RequestType, ResponseType]):
    wrapped_method: grpclib.client.UnaryStreamMethod[RequestType, ResponseType]

    def __init__(
        self,
        wrapped_method: grpclib.client.UnaryStreamMethod[RequestType, ResponseType],
        client: "_Client",
        server_url: str,
    ):
        self.wrapped_method = wrapped_method
        self.client = client
        self.server_url = server_url

    @property
    def name(self) -> str:
        return self.wrapped_method.name

    async def unary_stream(
        self,
        request,
        metadata: Optional[Any] = None,
    ):
        from .client import _Client

        if self.client._snapshotted:
            logger.debug(f"refreshing client after snapshot for {self.name.rsplit('/', 1)[1]}")
            self.client = await _Client.from_env()
        self.wrapped_method.channel = await self.client._get_channel(self.server_url)
        with grpc_error_converter():
            async for response in self.client._call_stream(self.wrapped_method, request, metadata=metadata):
                yield response
