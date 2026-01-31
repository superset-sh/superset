import modal.client
import modal_proto.api_pb2
import synchronicity.combined_types
import typing
import typing_extensions

class _TokenFlow:
    def __init__(self, client: modal.client._Client):
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def start(
        self, utm_source: typing.Optional[str] = None, next_url: typing.Optional[str] = None
    ) -> typing.AsyncContextManager[tuple[str, str, str]]:
        """mdmd:hidden"""
        ...

    async def finish(
        self, timeout: float = 40.0, grpc_extra_timeout: float = 5.0
    ) -> typing.Optional[modal_proto.api_pb2.TokenFlowWaitResponse]:
        """mdmd:hidden"""
        ...

class TokenFlow:
    def __init__(self, client: modal.client.Client): ...

    class __start_spec(typing_extensions.Protocol):
        def __call__(
            self, /, utm_source: typing.Optional[str] = None, next_url: typing.Optional[str] = None
        ) -> synchronicity.combined_types.AsyncAndBlockingContextManager[tuple[str, str, str]]:
            """mdmd:hidden"""
            ...

        def aio(
            self, /, utm_source: typing.Optional[str] = None, next_url: typing.Optional[str] = None
        ) -> typing.AsyncContextManager[tuple[str, str, str]]:
            """mdmd:hidden"""
            ...

    start: __start_spec

    class __finish_spec(typing_extensions.Protocol):
        def __call__(
            self, /, timeout: float = 40.0, grpc_extra_timeout: float = 5.0
        ) -> typing.Optional[modal_proto.api_pb2.TokenFlowWaitResponse]:
            """mdmd:hidden"""
            ...

        async def aio(
            self, /, timeout: float = 40.0, grpc_extra_timeout: float = 5.0
        ) -> typing.Optional[modal_proto.api_pb2.TokenFlowWaitResponse]:
            """mdmd:hidden"""
            ...

    finish: __finish_spec

async def _new_token(
    *,
    profile: typing.Optional[str] = None,
    activate: bool = True,
    verify: bool = True,
    source: typing.Optional[str] = None,
    next_url: typing.Optional[str] = None,
): ...
async def _set_token(
    token_id: str,
    token_secret: str,
    *,
    profile: typing.Optional[str] = None,
    activate: bool = True,
    verify: bool = True,
    server_url: typing.Optional[str] = None,
): ...
