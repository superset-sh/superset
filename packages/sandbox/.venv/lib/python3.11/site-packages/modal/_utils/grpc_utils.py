# Copyright Modal Labs 2022
import asyncio
import contextlib
import os
import platform
import socket
import time
import typing
import urllib.parse
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from functools import cache
from typing import Any, Optional, Sequence, TypeVar

import grpclib.client
import grpclib.config
import grpclib.events
from google.protobuf.message import Message
from google.protobuf.symbol_database import SymbolDatabase
from grpclib import GRPCError, Status
from grpclib.encoding.base import StatusDetailsCodecBase
from grpclib.exceptions import StreamTerminatedError
from grpclib.protocol import H2Protocol

from modal.exception import ConnectionError
from modal_proto import api_pb2
from modal_version import __version__

from .._traceback import suppress_tb_frame
from ..config import config
from .async_utils import retry
from .logger import logger

RequestType = TypeVar("RequestType", bound=Message)
ResponseType = TypeVar("ResponseType", bound=Message)

if typing.TYPE_CHECKING:
    import modal._grpc_client
    import modal.client

# Monkey patches grpclib to have a Modal User Agent header.
grpclib.client.USER_AGENT = "modal-client/{version} ({sys}; {py}/{py_ver})'".format(
    version=__version__,
    sys=platform.system(),
    py=platform.python_implementation(),
    py_ver=platform.python_version(),
).lower()


class Subchannel:
    protocol: H2Protocol
    created_at: float
    requests: int

    def __init__(self, protocol: H2Protocol) -> None:
        self.protocol = protocol
        self.created_at = time.time()
        self.requests = 0

    def connected(self):
        if hasattr(self.protocol.handler, "connection_lost"):
            # AbstractHandler doesn't have connection_lost, but Handler does
            return not self.protocol.handler.connection_lost  # type: ignore
        return True


RETRYABLE_GRPC_STATUS_CODES = [
    Status.DEADLINE_EXCEEDED,
    Status.UNAVAILABLE,
    Status.CANCELLED,
    Status.INTERNAL,
    Status.UNKNOWN,
]
SERVER_RETRY_WARNING_TIME_INTERVAL = 30.0


@dataclass
class RetryWarningMessage:
    message: str
    warning_interval: int
    errors_to_warn_for: typing.List[Status]


class ConnectionManager:
    """ConnectionManager is a helper class for sharing connections to the Modal server.

    It can create, cache, and close channels to the Modal server. This is useful since
    multiple ModalClientModal stubs may target the same server URL, in which case they
    should share the same connection.
    """

    def __init__(self, client: "modal.client._Client", metadata: dict[str, str] = {}):
        self._client = client
        # This metadata is injected into all requests on all channels created by this manager.
        self._metadata = metadata
        self._channels: dict[str, grpclib.client.Channel] = {}

    async def get_or_create_channel(self, server_url: str) -> grpclib.client.Channel:
        if server_url not in self._channels:
            self._channels[server_url] = create_channel(server_url, self._metadata)
            try:
                await connect_channel(self._channels[server_url])
            except OSError as exc:
                raise ConnectionError("Could not connect to the Modal server.") from exc
        return self._channels[server_url]

    def close(self):
        for channel in self._channels.values():
            channel.close()
        self._channels.clear()


@cache
def _sym_db() -> SymbolDatabase:
    from google.protobuf.symbol_database import Default

    return Default()


class CustomProtoStatusDetailsCodec(StatusDetailsCodecBase):
    """grpclib compatible details codec.

    The server can encode the details using `google.rpc.Status` using grpclib's default codec and this custom codec
    can decode it into a `api_pb2.RPCStatus`.
    """

    def encode(
        self,
        status: Status,
        message: Optional[str],
        details: Optional[Sequence[Message]],
    ) -> bytes:
        details_proto = api_pb2.RPCStatus(code=status.value, message=message or "")
        if details is not None:
            for detail in details:
                detail_container = details_proto.details.add()
                detail_container.Pack(detail)
        return details_proto.SerializeToString()

    def decode(
        self,
        status: Status,
        message: Optional[str],
        data: bytes,
    ) -> Any:
        sym_db = _sym_db()
        details_proto = api_pb2.RPCStatus.FromString(data)

        details = []
        for detail_container in details_proto.details:
            # If we do not know how to decode an emssage, we'll ignore it.
            with contextlib.suppress(Exception):
                msg_type = sym_db.GetSymbol(detail_container.TypeName())
                detail = msg_type()
                detail_container.Unpack(detail)
                details.append(detail)
        return details


custom_detail_codec = CustomProtoStatusDetailsCodec()


def create_channel(
    server_url: str,
    metadata: dict[str, str] = {},
) -> grpclib.client.Channel:
    """Creates a grpclib.Channel to be used by a GRPC stub.

    The given metadata dict is injected into all outgoing requests on this channel.
    """
    o = urllib.parse.urlparse(server_url)

    channel: grpclib.client.Channel
    config = grpclib.config.Configuration(
        http2_connection_window_size=64 * 1024 * 1024,  # 64 MiB
        http2_stream_window_size=64 * 1024 * 1024,  # 64 MiB
    )

    if o.scheme == "unix":
        channel = grpclib.client.Channel(path=o.path, config=config, status_details_codec=custom_detail_codec)
    elif o.scheme in ("http", "https"):
        target = o.netloc
        parts = target.split(":")
        assert 1 <= len(parts) <= 2, "Invalid target location: " + target
        ssl = o.scheme.endswith("s")
        host = parts[0]
        port = int(parts[1]) if len(parts) == 2 else 443 if ssl else 80
        channel = grpclib.client.Channel(host, port, ssl=ssl, config=config, status_details_codec=custom_detail_codec)
    else:
        raise Exception(f"Unknown scheme: {o.scheme}")

    target = o.path if o.scheme == "unix" else o.netloc
    logger.debug(f"Connecting to {target} using scheme {o.scheme}")

    # Inject metadata for the client.
    async def send_request(event: grpclib.events.SendRequest) -> None:
        for k, v in metadata.items():
            event.metadata[k] = v

        logger.debug(f"Sending request to {event.method_name}")

    grpclib.events.listen(channel, grpclib.events.SendRequest, send_request)

    return channel


@retry(n_attempts=5, base_delay=0.1)
async def connect_channel(channel: grpclib.client.Channel):
    """Connect to socket and raise exceptions when there is a connection issue."""
    await channel.__connect__()


if typing.TYPE_CHECKING:
    import modal.client


async def unary_stream(
    method: "modal._grpc_client.UnaryStreamWrapper[RequestType, ResponseType]",
    request: RequestType,
    metadata: Optional[Any] = None,
) -> AsyncIterator[ResponseType]:
    # TODO: remove this, since we have a method now
    async for item in method.unary_stream(request, metadata):
        yield item


@dataclass(frozen=True)
class Retry:
    base_delay: float = 0.1
    max_delay: float = 1
    delay_factor: float = 2
    max_retries: Optional[int] = 3
    additional_status_codes: list = field(default_factory=list)
    attempt_timeout: Optional[float] = None  # timeout for each attempt
    total_timeout: Optional[float] = None  # timeout for the entire function call
    attempt_timeout_floor: float = 2.0  # always have at least this much timeout (only for total_timeout)
    warning_message: Optional[RetryWarningMessage] = None


async def retry_transient_errors(
    fn: "grpclib.client.UnaryUnaryMethod[RequestType, ResponseType]",
    req: RequestType,
    max_retries: Optional[int] = 3,
) -> ResponseType:
    """Minimum API version of _retry_transient_errors that works with grpclib.client.UnaryUnaryMethod.

    Used by modal server.
    """
    return await _retry_transient_errors(fn, req, retry=Retry(max_retries=max_retries))


def get_server_retry_policy(exc: Exception) -> Optional[api_pb2.RPCRetryPolicy]:
    """Get server retry policy."""
    if not isinstance(exc, GRPCError) or not exc.details:
        return None

    # Server should not set multiple retry instructions, but if there is more than one, pick the first one
    for entry in exc.details:
        if isinstance(entry, api_pb2.RPCRetryPolicy):
            return entry
    return None


def process_exception_before_retry(
    exc: Exception,
    final_attempt: bool,
    fn_name: str,
    n_retries: int,
    delay: float,
    idempotency_key: str,
):
    """Process exception before retry, used by `_retry_transient_errors`."""
    with suppress_tb_frame():
        if final_attempt:
            logger.debug(
                f"Final attempt failed with {repr(exc)} {n_retries=} {delay=} for {fn_name} ({idempotency_key[:8]})"
            )
            if isinstance(exc, OSError):
                raise ConnectionError(str(exc))
            elif isinstance(exc, asyncio.TimeoutError):
                raise ConnectionError(str(exc))
            else:
                raise exc

        if isinstance(exc, AttributeError) and "_write_appdata" not in str(exc):
            # StreamTerminatedError are not properly raised in grpclib<=0.4.7
            # fixed in https://github.com/vmagamedov/grpclib/issues/185
            # TODO: update to newer version (>=0.4.8) once stable
            # Also be sure to remove the AttributeError from the set of exceptions
            # we handle in the retry logic once we drop this check!
            raise exc

    logger.debug(f"Retryable failure {repr(exc)} {n_retries=} {delay=} for {fn_name} ({idempotency_key[:8]})")


async def _retry_transient_errors(
    fn: typing.Union[
        "modal._grpc_client.UnaryUnaryWrapper[RequestType, ResponseType]",
        "grpclib.client.UnaryUnaryMethod[RequestType, ResponseType]",
    ],
    req: RequestType,
    retry: Retry,
    metadata: Optional[list[tuple[str, str]]] = None,
) -> ResponseType:
    """Retry on transient gRPC failures with back-off until max_retries is reached.
    If max_retries is None, retry forever."""
    import modal._grpc_client

    if isinstance(fn, modal._grpc_client.UnaryUnaryWrapper):
        fn_callable = fn.direct
    elif isinstance(fn, grpclib.client.UnaryUnaryMethod):
        fn_callable = fn  # type: ignore
    else:
        raise ValueError("Only modal._grpc_client.UnaryUnaryWrapper and grpclib.client.UnaryUnaryMethod are supported")

    delay = retry.base_delay
    n_retries = 0
    n_throttled_retries = 0

    status_codes = [*RETRYABLE_GRPC_STATUS_CODES, *retry.additional_status_codes]

    idempotency_key = str(uuid.uuid4())

    t0 = time.time()
    last_server_retry_warning_time = None

    if retry.total_timeout is not None:
        total_deadline = t0 + retry.total_timeout
    else:
        total_deadline = None

    metadata = (metadata or []) + [("x-modal-timestamp", str(time.time()))]

    while True:
        attempt_metadata = [
            ("x-idempotency-key", idempotency_key),
            ("x-retry-attempt", str(n_retries)),
            ("x-throttle-retry-attempt", str(n_throttled_retries)),
            *metadata,
        ]
        if n_retries > 0:
            attempt_metadata.append(("x-retry-delay", str(time.time() - t0)))
        if n_throttled_retries > 0:
            attempt_metadata.append(("x-throttle-retry-delay", str(time.time() - t0)))

        timeouts = []
        if retry.attempt_timeout is not None:
            timeouts.append(retry.attempt_timeout)
        if total_deadline is not None:
            timeouts.append(max(total_deadline - time.time(), retry.attempt_timeout_floor))
        if timeouts:
            timeout = min(timeouts)  # In case the function provided both types of timeouts
        else:
            timeout = None

        try:
            with suppress_tb_frame():
                return await fn_callable(req, metadata=attempt_metadata, timeout=timeout)
        except (StreamTerminatedError, GRPCError, OSError, asyncio.TimeoutError, AttributeError) as exc:
            # Note that we only catch AttributeError to handle a specific case that works around a bug
            # in grpclib<=0.4.7. See above (search for `write_appdata`).

            # Server side instruction for retries
            max_throttle_wait: Optional[int] = config.get("max_throttle_wait")
            if (
                max_throttle_wait != 0
                and isinstance(exc, GRPCError)
                and (server_retry_policy := get_server_retry_policy(exc))
            ):
                server_delay = server_retry_policy.retry_after_secs

                now = time.time()

                # We check if the timeout will be reached **after** the sleep, so we can raise an error early
                # without needing to actually sleep.
                total_timeout_will_be_reached = (
                    retry.total_timeout is not None and (now + server_delay - t0) >= retry.total_timeout
                )
                max_throttle_will_be_reached = (
                    max_throttle_wait is not None and (now + server_delay - t0) >= max_throttle_wait
                )
                final_attempt = total_timeout_will_be_reached or max_throttle_will_be_reached

                with suppress_tb_frame():
                    process_exception_before_retry(
                        exc, final_attempt, fn.name, n_retries, server_delay, idempotency_key
                    )

                now = time.time()
                if last_server_retry_warning_time is None or (
                    now - last_server_retry_warning_time >= SERVER_RETRY_WARNING_TIME_INTERVAL
                ):
                    last_server_retry_warning_time = now
                    logger.warning(
                        f"Warning: Received {exc.status}{os.linesep}"
                        f"{exc.message}{os.linesep}"
                        f"Will retry in {server_delay:0.2f} seconds."
                    )

                n_throttled_retries += 1
                await asyncio.sleep(server_delay)
                continue

            # Client handles retry
            if isinstance(exc, GRPCError) and exc.status not in status_codes:
                raise exc
            if retry.max_retries is not None and n_retries >= retry.max_retries:
                final_attempt = True
            elif total_deadline is not None and time.time() + delay + retry.attempt_timeout_floor >= total_deadline:
                final_attempt = True
            else:
                final_attempt = False

            with suppress_tb_frame():
                process_exception_before_retry(exc, final_attempt, fn.name, n_retries, delay, idempotency_key)

            n_retries += 1

            if (
                retry.warning_message
                and n_retries % retry.warning_message.warning_interval == 0
                and isinstance(exc, GRPCError)
                and exc.status in retry.warning_message.errors_to_warn_for
            ):
                logger.warning(retry.warning_message.message)

            await asyncio.sleep(delay)
            delay = min(delay * retry.delay_factor, retry.max_delay)


def find_free_port() -> int:
    """
    Find a free TCP port, useful for testing.

    WARN: if a returned free port is not bound immediately by the caller, that same port
    may be returned in subsequent calls to this function, potentially creating port collisions.
    """
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("", 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.getsockname()[1]


def get_proto_oneof(message: Message, oneof_group: str) -> Optional[Message]:
    oneof_field = message.WhichOneof(oneof_group)
    if oneof_field is None:
        return None

    return getattr(message, oneof_field)
