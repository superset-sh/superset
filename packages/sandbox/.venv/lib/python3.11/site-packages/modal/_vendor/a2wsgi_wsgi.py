"""
Vendored version of a2wsgi v1.10.2.

We vendor only a2wsgi/wsgi.py, plus type annotations, to convert WSGI apps into ASGI protocol
versions using the `WSGIMiddleware` class.

This is a well-tested library marked as an optional dependency of uvicorn. It doesn't have the
issues with buffering request streams that asgiref has, and it also is simpler, only requiring a
standard `concurrent.futures.ThreadPoolExecutor`.

---

   Copyright 2022 abersheeran

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
"""

import asyncio
import contextvars
import functools
import os
import sys
import typing
from concurrent.futures import ThreadPoolExecutor
from types import TracebackType
from typing import (
    Any,
    Callable,
    Dict,
    List,
    Literal,
    Optional,
    Protocol,
    Tuple,
    Type,
    TypedDict,
    Union,
)
from collections.abc import Awaitable, Iterable


## BEGIN a2wsgi/asgi_typing.py

if sys.version_info >= (3, 11):
    from typing import NotRequired
else:
    from typing_extensions import NotRequired


class ASGIVersions(TypedDict):
    spec_version: str
    version: Literal["3.0"]


class HTTPScope(TypedDict):
    type: Literal["http"]
    asgi: ASGIVersions
    http_version: str
    method: str
    scheme: str
    path: str
    raw_path: NotRequired[bytes]
    query_string: bytes
    root_path: str
    headers: Iterable[tuple[bytes, bytes]]
    client: NotRequired[tuple[str, int]]
    server: NotRequired[tuple[str, Optional[int]]]
    state: NotRequired[dict[str, Any]]
    extensions: NotRequired[dict[str, dict[object, object]]]


class WebSocketScope(TypedDict):
    type: Literal["websocket"]
    asgi: ASGIVersions
    http_version: str
    scheme: str
    path: str
    raw_path: bytes
    query_string: bytes
    root_path: str
    headers: Iterable[tuple[bytes, bytes]]
    client: NotRequired[tuple[str, int]]
    server: NotRequired[tuple[str, Optional[int]]]
    subprotocols: Iterable[str]
    state: NotRequired[dict[str, Any]]
    extensions: NotRequired[dict[str, dict[object, object]]]


class LifespanScope(TypedDict):
    type: Literal["lifespan"]
    asgi: ASGIVersions
    state: NotRequired[dict[str, Any]]


WWWScope = Union[HTTPScope, WebSocketScope]
Scope = Union[HTTPScope, WebSocketScope, LifespanScope]


class HTTPRequestEvent(TypedDict):
    type: Literal["http.request"]
    body: bytes
    more_body: NotRequired[bool]


class HTTPResponseStartEvent(TypedDict):
    type: Literal["http.response.start"]
    status: int
    headers: NotRequired[Iterable[tuple[bytes, bytes]]]
    trailers: NotRequired[bool]


class HTTPResponseBodyEvent(TypedDict):
    type: Literal["http.response.body"]
    body: NotRequired[bytes]
    more_body: NotRequired[bool]


class HTTPDisconnectEvent(TypedDict):
    type: Literal["http.disconnect"]


class WebSocketConnectEvent(TypedDict):
    type: Literal["websocket.connect"]


class WebSocketAcceptEvent(TypedDict):
    type: Literal["websocket.accept"]
    subprotocol: NotRequired[str]
    headers: NotRequired[Iterable[tuple[bytes, bytes]]]


class WebSocketReceiveEvent(TypedDict):
    type: Literal["websocket.receive"]
    bytes: NotRequired[bytes]
    text: NotRequired[str]


class WebSocketSendEvent(TypedDict):
    type: Literal["websocket.send"]
    bytes: NotRequired[bytes]
    text: NotRequired[str]


class WebSocketDisconnectEvent(TypedDict):
    type: Literal["websocket.disconnect"]
    code: int


class WebSocketCloseEvent(TypedDict):
    type: Literal["websocket.close"]
    code: NotRequired[int]
    reason: NotRequired[str]


class LifespanStartupEvent(TypedDict):
    type: Literal["lifespan.startup"]


class LifespanShutdownEvent(TypedDict):
    type: Literal["lifespan.shutdown"]


class LifespanStartupCompleteEvent(TypedDict):
    type: Literal["lifespan.startup.complete"]


class LifespanStartupFailedEvent(TypedDict):
    type: Literal["lifespan.startup.failed"]
    message: str


class LifespanShutdownCompleteEvent(TypedDict):
    type: Literal["lifespan.shutdown.complete"]


class LifespanShutdownFailedEvent(TypedDict):
    type: Literal["lifespan.shutdown.failed"]
    message: str


ReceiveEvent = Union[
    HTTPRequestEvent,
    HTTPDisconnectEvent,
    WebSocketConnectEvent,
    WebSocketReceiveEvent,
    WebSocketDisconnectEvent,
    LifespanStartupEvent,
    LifespanShutdownEvent,
]

SendEvent = Union[
    HTTPResponseStartEvent,
    HTTPResponseBodyEvent,
    HTTPDisconnectEvent,
    WebSocketAcceptEvent,
    WebSocketSendEvent,
    WebSocketCloseEvent,
    LifespanStartupCompleteEvent,
    LifespanStartupFailedEvent,
    LifespanShutdownCompleteEvent,
    LifespanShutdownFailedEvent,
]

Receive = Callable[[], Awaitable[ReceiveEvent]]

Send = Callable[[SendEvent], Awaitable[None]]

ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

## END a2wsgi/asgi_typing.py


## BEGIN a2wsgi/wsgi_typing.py

class CGIRequiredDefined(TypedDict):
    # The HTTP request method, such as GET or POST. This cannot ever be an
    # empty string, and so is always required.
    REQUEST_METHOD: str
    # When HTTP_HOST is not set, these variables can be combined to determine
    # a default.
    # SERVER_NAME and SERVER_PORT are required strings and must never be empty.
    SERVER_NAME: str
    SERVER_PORT: str
    # The version of the protocol the client used to send the request.
    # Typically this will be something like "HTTP/1.0" or "HTTP/1.1" and
    # may be used by the application to determine how to treat any HTTP
    # request headers. (This variable should probably be called REQUEST_PROTOCOL,
    # since it denotes the protocol used in the request, and is not necessarily
    # the protocol that will be used in the server's response. However, for
    # compatibility with CGI we have to keep the existing name.)
    SERVER_PROTOCOL: str

class CGIOptionalDefined(TypedDict, total=False):
    REQUEST_URI: str
    REMOTE_ADDR: str
    REMOTE_PORT: str
    # The initial portion of the request URL’s “path” that corresponds to the
    # application object, so that the application knows its virtual “location”.
    # This may be an empty string, if the application corresponds to the “root”
    # of the server.
    SCRIPT_NAME: str
    # The remainder of the request URL’s “path”, designating the virtual
    # “location” of the request’s target within the application. This may be an
    # empty string, if the request URL targets the application root and does
    # not have a trailing slash.
    PATH_INFO: str
    # The portion of the request URL that follows the “?”, if any. May be empty
    # or absent.
    QUERY_STRING: str
    # The contents of any Content-Type fields in the HTTP request. May be empty
    # or absent.
    CONTENT_TYPE: str
    # The contents of any Content-Length fields in the HTTP request. May be empty
    # or absent.
    CONTENT_LENGTH: str


class InputStream(Protocol):
    """
    An input stream (file-like object) from which the HTTP request body bytes can be
    read. (The server or gateway may perform reads on-demand as requested by the
    application, or it may pre- read the client's request body and buffer it in-memory
    or on disk, or use any other technique for providing such an input stream, according
    to its preference.)
    """

    def read(self, size: int = -1, /) -> bytes:
        """
        The server is not required to read past the client's specified Content-Length,
        and should simulate an end-of-file condition if the application attempts to read
        past that point. The application should not attempt to read more data than is
        specified by the CONTENT_LENGTH variable.
        A server should allow read() to be called without an argument, and return the
        remainder of the client's input stream.
        A server should return empty bytestrings from any attempt to read from an empty
        or exhausted input stream.
        """
        raise NotImplementedError

    def readline(self, limit: int = -1, /) -> bytes:
        """
        Servers should support the optional "size" argument to readline(), but as in
        WSGI 1.0, they are allowed to omit support for it.
        (In WSGI 1.0, the size argument was not supported, on the grounds that it might
        have been complex to implement, and was not often used in practice... but then
        the cgi module started using it, and so practical servers had to start
        supporting it anyway!)
        """
        raise NotImplementedError

    def readlines(self, hint: int = -1, /) -> list[bytes]:
        """
        Note that the hint argument to readlines() is optional for both caller and
        implementer. The application is free not to supply it, and the server or gateway
        is free to ignore it.
        """
        raise NotImplementedError


class ErrorStream(Protocol):
    """
    An output stream (file-like object) to which error output can be written,
    for the purpose of recording program or other errors in a standardized and
    possibly centralized location. This should be a "text mode" stream;
    i.e., applications should use "\n" as a line ending, and assume that it will
    be converted to the correct line ending by the server/gateway.
    (On platforms where the str type is unicode, the error stream should accept
    and log arbitrary unicode without raising an error; it is allowed, however,
    to substitute characters that cannot be rendered in the stream's encoding.)
    For many servers, wsgi.errors will be the server's main error log. Alternatively,
    this may be sys.stderr, or a log file of some sort. The server's documentation
    should include an explanation of how to configure this or where to find the
    recorded output. A server or gateway may supply different error streams to
    different applications, if this is desired.
    """

    def flush(self) -> None:
        """
        Since the errors stream may not be rewound, servers and gateways are free to
        forward write operations immediately, without buffering. In this case, the
        flush() method may be a no-op. Portable applications, however, cannot assume
        that output is unbuffered or that flush() is a no-op. They must call flush()
        if they need to ensure that output has in fact been written.
        (For example, to minimize intermingling of data from multiple processes writing
        to the same error log.)
        """
        raise NotImplementedError

    def write(self, s: str, /) -> Any:
        raise NotImplementedError

    def writelines(self, seq: list[str], /) -> Any:
        raise NotImplementedError


WSGIDefined = TypedDict(
    "WSGIDefined",
    {
        "wsgi.version": tuple[int, int],  # e.g. (1, 0)
        "wsgi.url_scheme": str,  # e.g. "http" or "https"
        "wsgi.input": InputStream,
        "wsgi.errors": ErrorStream,
        # This value should evaluate true if the application object may be simultaneously
        # invoked by another thread in the same process, and should evaluate false otherwise.
        "wsgi.multithread": bool,
        # This value should evaluate true if an equivalent application object may be
        # simultaneously invoked by another process, and should evaluate false otherwise.
        "wsgi.multiprocess": bool,
        # This value should evaluate true if the server or gateway expects (but does
        # not guarantee!) that the application will only be invoked this one time during
        # the life of its containing process. Normally, this will only be true for a
        # gateway based on CGI (or something similar).
        "wsgi.run_once": bool,
    },
)


class Environ(CGIRequiredDefined, CGIOptionalDefined, WSGIDefined):
    """
    WSGI Environ
    """


ExceptionInfo = tuple[type[BaseException], BaseException, Optional[TracebackType]]

# https://peps.python.org/pep-3333/#the-write-callable
WriteCallable = Callable[[bytes], None]


class StartResponse(Protocol):
    def __call__(
        self,
        status: str,
        response_headers: list[tuple[str, str]],
        exc_info: Optional[ExceptionInfo] = None,
        /,
    ) -> WriteCallable:
        raise NotImplementedError


IterableChunks = Iterable[bytes]

WSGIApp = Callable[[Environ, StartResponse], IterableChunks]

## END a2wsgi/wsgi_typing.py


## BEGIN a2wsgi/wsgi.py

class Body:
    def __init__(self, loop: asyncio.AbstractEventLoop, receive: Receive) -> None:
        self.buffer = bytearray()
        self.loop = loop
        self.receive = receive
        self._has_more = True

    @property
    def has_more(self) -> bool:
        if self._has_more or self.buffer:
            return True
        return False

    def _receive_more_data(self) -> bytes:
        if not self._has_more:
            return b""
        future = asyncio.run_coroutine_threadsafe(self.receive(), loop=self.loop)
        message = future.result()
        self._has_more = message.get("more_body", False)
        return message.get("body", b"")

    def read(self, size: int = -1) -> bytes:
        while size == -1 or size > len(self.buffer):
            self.buffer.extend(self._receive_more_data())
            if not self._has_more:
                break
        if size == -1:
            result = bytes(self.buffer)
            self.buffer.clear()
        else:
            result = bytes(self.buffer[:size])
            del self.buffer[:size]
        return result

    def readline(self, limit: int = -1) -> bytes:
        while True:
            lf_index = self.buffer.find(b"\n", 0, limit if limit > -1 else None)
            if lf_index != -1:
                result = bytes(self.buffer[: lf_index + 1])
                del self.buffer[: lf_index + 1]
                return result
            elif limit != -1:
                result = bytes(self.buffer[:limit])
                del self.buffer[:limit]
                return result
            if not self._has_more:
                break
            self.buffer.extend(self._receive_more_data())

        result = bytes(self.buffer)
        self.buffer.clear()
        return result

    def readlines(self, hint: int = -1) -> list[bytes]:
        if not self.has_more:
            return []
        if hint == -1:
            raw_data = self.read(-1)
            bytelist = raw_data.split(b"\n")
            if raw_data[-1] == 10:  # 10 -> b"\n"
                bytelist.pop(len(bytelist) - 1)
            return [line + b"\n" for line in bytelist]
        return [self.readline() for _ in range(hint)]

    def __iter__(self) -> typing.Generator[bytes, None, None]:
        while self.has_more:
            yield self.readline()


ENC, ESC = sys.getfilesystemencoding(), "surrogateescape"


def unicode_to_wsgi(u):
    """Convert an environment variable to a WSGI "bytes-as-unicode" string"""
    return u.encode(ENC, ESC).decode("iso-8859-1")


def build_environ(scope: HTTPScope, body: Body) -> Environ:
    """
    Builds a scope and request body into a WSGI environ object.
    """
    script_name = scope.get("root_path", "").encode("utf8").decode("latin1")
    path_info = scope["path"].encode("utf8").decode("latin1")
    if path_info.startswith(script_name):
        path_info = path_info[len(script_name) :]

    script_name_environ_var = os.environ.get("SCRIPT_NAME", "")
    if script_name_environ_var:
        script_name = unicode_to_wsgi(script_name_environ_var)

    environ: Environ = {
        "asgi.scope": scope,  # type: ignore a2wsgi
        "REQUEST_METHOD": scope["method"],
        "SCRIPT_NAME": script_name,
        "PATH_INFO": path_info,
        "QUERY_STRING": scope["query_string"].decode("ascii"),
        "SERVER_PROTOCOL": f"HTTP/{scope['http_version']}",
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": scope.get("scheme", "http"),
        "wsgi.input": body,
        "wsgi.errors": sys.stdout,
        "wsgi.multithread": True,
        "wsgi.multiprocess": True,
        "wsgi.run_once": False,
    }

    # Get server name and port - required in WSGI, not in ASGI
    server_addr, server_port = scope.get("server") or ("localhost", 80)
    environ["SERVER_NAME"] = server_addr
    environ["SERVER_PORT"] = str(server_port or 0)

    # Get client IP address
    client = scope.get("client")
    if client is not None:
        addr, port = client
        environ["REMOTE_ADDR"] = addr
        environ["REMOTE_PORT"] = str(port)

    # Go through headers and make them into environ entries
    for name, value in scope.get("headers", []):
        name = name.decode("latin1")
        if name == "content-length":
            corrected_name = "CONTENT_LENGTH"
        elif name == "content-type":
            corrected_name = "CONTENT_TYPE"
        else:
            corrected_name = f"HTTP_{name}".upper().replace("-", "_")
        # HTTPbis say only ASCII chars are allowed in headers, but we latin1 just in case
        value = value.decode("latin1")
        if corrected_name in environ:
            value = environ[corrected_name] + "," + value
        environ[corrected_name] = value
    return environ


class WSGIMiddleware:
    """
    Convert WSGIApp to ASGIApp.
    """

    def __init__(
        self, app: WSGIApp, workers: int = 10, send_queue_size: int = 10
    ) -> None:
        self.app = app
        self.send_queue_size = send_queue_size
        self.executor = ThreadPoolExecutor(
            thread_name_prefix="WSGI", max_workers=workers
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            responder = WSGIResponder(self.app, self.executor, self.send_queue_size)
            return await responder(scope, receive, send)

        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 1000})
            return

        if scope["type"] == "lifespan":
            message = await receive()
            assert message["type"] == "lifespan.startup"
            await send({"type": "lifespan.startup.complete"})
            message = await receive()
            assert message["type"] == "lifespan.shutdown"
            await send({"type": "lifespan.shutdown.complete"})
            return


class WSGIResponder:
    def __init__(
        self, app: WSGIApp, executor: ThreadPoolExecutor, send_queue_size: int
    ) -> None:
        self.app = app
        self.executor = executor
        self.loop = asyncio.get_event_loop()
        self.send_queue = asyncio.Queue(send_queue_size)
        self.response_started = False
        self.exc_info: typing.Any = None

    async def __call__(self, scope: HTTPScope, receive: Receive, send: Send) -> None:
        body = Body(self.loop, receive)
        environ = build_environ(scope, body)
        sender = None
        try:
            sender = self.loop.create_task(self.sender(send))
            context = contextvars.copy_context()
            func = functools.partial(context.run, self.wsgi)
            await self.loop.run_in_executor(
                self.executor, func, environ, self.start_response
            )
            await self.send_queue.put(None)
            await self.send_queue.join()
            await asyncio.wait_for(sender, None)
            if self.exc_info is not None:
                raise self.exc_info[0].with_traceback(
                    self.exc_info[1], self.exc_info[2]
                )
        finally:
            if sender and not sender.done():
                sender.cancel()  # pragma: no cover

    def send(self, message: typing.Optional[SendEvent]) -> None:
        future = asyncio.run_coroutine_threadsafe(
            self.send_queue.put(message),
            loop=self.loop,
        )
        future.result()

    async def sender(self, send: Send) -> None:
        while True:
            message = await self.send_queue.get()
            self.send_queue.task_done()
            if message is None:
                return
            await send(message)

    def start_response(
        self,
        status: str,
        response_headers: list[tuple[str, str]],
        exc_info: typing.Optional[ExceptionInfo] = None,
    ) -> WriteCallable:
        self.exc_info = exc_info
        if not self.response_started:
            self.response_started = True
            status_code_string, _ = status.split(" ", 1)
            status_code = int(status_code_string)
            headers = [
                (name.strip().encode("latin1").lower(), value.strip().encode("latin1"))
                for name, value in response_headers
            ]
            self.send(
                {
                    "type": "http.response.start",
                    "status": status_code,
                    "headers": headers,
                }
            )
        return lambda chunk: self.send(
            {"type": "http.response.body", "body": chunk, "more_body": True}
        )

    def wsgi(self, environ: Environ, start_response: StartResponse) -> None:
        iterable = self.app(environ, start_response)
        try:
            for chunk in iterable:
                self.send(
                    {"type": "http.response.body", "body": chunk, "more_body": True}
                )

            self.send({"type": "http.response.body", "body": b""})
        finally:
            getattr(iterable, "close", lambda: None)()

## END a2wsgi/wsgi.py

