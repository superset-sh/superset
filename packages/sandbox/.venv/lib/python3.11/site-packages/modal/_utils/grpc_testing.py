# Copyright Modal Labs 2023
import contextlib
import inspect
import logging
import typing
from collections import Counter, defaultdict
from collections.abc import Awaitable
from typing import Any, Callable

import grpclib.server
from grpclib import GRPCError, Status

from modal.config import logger

if typing.TYPE_CHECKING:
    from test.conftest import MockClientServicer


def patch_mock_servicer(cls):
    """Adds an `.intercept()` context manager method

    This allows for context-local tracking and assertions of all calls
    performed on the servicer during a context, e.g.:

    ```python notest
    with servicer.intercept() as ctx:
        await some_complex_method()
    assert ctx.calls == [("SomeMethod", MyMessage(foo="bar"))]
    ```
    Also allows to set a predefined queue of responses, temporarily replacing
    a mock servicer's default responses for a method:

    ```python notest
    with servicer.intercept() as ctx:
        ctx.add_response("SomeMethod", [
            MyResponse(bar="baz")
        ])
        ctx.add_response("SomeMethod", [
            MyResponse(bar="baz2")
        ])
        await service_stub.SomeMethod(Empty())  # receives MyResponse(bar="baz")
        await service_stub.SomeMethod(Empty())  # receives MyResponse(bar="baz2")
    ```

    Also patches all unimplemented abstract methods in a mock servicer with default error implementations.
    """

    def fallback(name: str):
        async def _fallback(self, stream) -> None:
            raise GRPCError(Status.UNIMPLEMENTED, f"{name} not implemented in mock servicer " + repr(cls))

        return _fallback

    @contextlib.contextmanager
    def intercept(servicer):
        ctx = InterceptionContext(servicer)
        servicer.interception_context = ctx
        yield ctx
        ctx._assert_responses_consumed()
        servicer.interception_context = None

    cls.intercept = intercept
    cls.interception_context = None

    def patch_grpc_method(method_name, original_method):
        async def patched_method(servicer_self, stream):
            try:
                ctx = servicer_self.interception_context
                if ctx:
                    intercepted_stream = await InterceptedStream(ctx, method_name, stream).initialize()
                    custom_responder = ctx._next_custom_responder(method_name, intercepted_stream.request_message)
                    if custom_responder:
                        return await custom_responder(servicer_self, intercepted_stream)
                    else:
                        # use default servicer, but intercept messages for assertions
                        return await original_method(servicer_self, intercepted_stream)
                else:
                    return await original_method(servicer_self, stream)
            except GRPCError:
                raise
            except Exception:
                logger.exception("Error in mock servicer responder:")
                raise

        return patched_method

    # Fill in the remaining methods on the class
    for name in dir(cls):
        method = getattr(cls, name)
        if getattr(method, "__isabstractmethod__", False):
            setattr(cls, name, patch_grpc_method(name, fallback(name)))
        elif name[0].isupper() and inspect.isfunction(method):
            setattr(cls, name, patch_grpc_method(name, method))

    cls.__abstractmethods__ = frozenset()
    return cls


class ResponseNotConsumed(Exception):
    def __init__(self, unconsumed_requests: list[str]):
        self.unconsumed_requests = unconsumed_requests
        request_count = Counter(unconsumed_requests)
        super().__init__(f"Expected but did not receive the following requests: {request_count}")


class InterceptionContext:
    def __init__(self, servicer):
        self._servicer = servicer
        self.calls: list[tuple[str, Any]] = []  # List[Tuple[method_name, message]]
        self.custom_responses: dict[str, list[tuple[Callable[[Any], bool], list[Any]]]] = defaultdict(list)
        self.custom_defaults: dict[str, Callable[["MockClientServicer", grpclib.server.Stream], Awaitable[None]]] = {}

    def add_response(
        self, method_name: str, first_payload, *, request_filter: Callable[[Any], bool] = lambda req: True
    ):
        """Adds one response payload to an expected queue of responses for a method.

        These responses will be used once each instead of calling the MockServicer's
        implementation of the method.

        The interception context will throw an exception on exit if not all of the added
        responses have been consumed.
        """
        self.custom_responses[method_name].append((request_filter, [first_payload]))

    def set_responder(
        self, method_name: str, responder: Callable[["MockClientServicer", grpclib.server.Stream], Awaitable[None]]
    ):
        """Replace the default responder from the MockClientServicer with a custom implementation

        ```python notest
        def custom_responder(servicer, stream):
            request = stream.recv_message()
            await stream.send_message(api_pb2.SomeMethodResponse(foo=123))

        with servicer.intercept() as ctx:
            ctx.set_responder("SomeMethod", custom_responder)
        ```

        Responses added via `.add_response()` take precedence over the use of this replacement
        """
        self.custom_defaults[method_name] = responder

    def pop_request(self, method_name):
        # fast forward to the next request of type method_name
        # dropping any preceding requests if there is a match
        # returns the payload of the request
        for i, (_method_name, msg) in enumerate(self.calls):
            if _method_name == method_name:
                self.calls = self.calls[i + 1 :]
                return msg

        raise KeyError(f"No message of that type in call list: {self.calls}")

    def get_requests(self, method_name: str) -> list[Any]:
        if not hasattr(self._servicer, method_name):
            # we check this to prevent things like `assert ctx.get_requests("ASdfFunctionCreate") == 0` passing
            raise ValueError(f"{method_name} not in MockServicer - did you spell it right?")
        return [msg for _method_name, msg in self.calls if _method_name == method_name]

    def _add_recv(self, method_name: str, msg):
        self.calls.append((method_name, msg))

    def _next_custom_responder(self, method_name, request):
        method_responses = self.custom_responses[method_name]
        for i, (request_filter, response_messages) in enumerate(method_responses):
            try:
                request_matches = request_filter(request)
            except Exception:
                logging.exception("Error when filtering requests")
                raise

            if request_matches:
                next_response_messages = response_messages
                self.custom_responses[method_name] = method_responses[:i] + method_responses[i + 1 :]
                break
        else:
            custom_default = self.custom_defaults.get(method_name)
            if not custom_default:
                return None
            return custom_default

        # build a new temporary responder based on the next queued response messages (added via add_response)
        async def responder(servicer_self, stream):
            await stream.recv_message()  # get the input message so we can track that
            for msg in next_response_messages:
                await stream.send_message(msg)

        return responder

    def _assert_responses_consumed(self):
        unconsumed = []
        for method_name, queued_responses in self.custom_responses.items():
            unconsumed += [method_name] * len(queued_responses)

        if unconsumed:
            raise ResponseNotConsumed(unconsumed)


class InterceptedStream:
    def __init__(self, interception_context: InterceptionContext, method_name: str, stream):
        self.interception_context = interception_context
        self.method_name = method_name
        self.stream = stream
        self.request_message = None

    async def initialize(self):
        self.request_message = await self.recv_message()
        return self

    async def recv_message(self):
        if self.request_message:
            ret = self.request_message
            self.request_message = None
            return ret

        msg = await self.stream.recv_message()
        self.interception_context._add_recv(self.method_name, msg)
        return msg

    async def send_message(self, msg):
        await self.stream.send_message(msg)

    def __getattr__(self, attr):
        return getattr(self.stream, attr)
