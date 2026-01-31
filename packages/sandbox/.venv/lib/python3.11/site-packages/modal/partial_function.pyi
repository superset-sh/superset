import collections.abc
import modal._partial_function
import modal.functions
import typing
import typing_extensions

class PartialFunction(
    typing.Generic[
        modal._partial_function.P, modal._partial_function.ReturnType, modal._partial_function.OriginalReturnType
    ]
):
    """Object produced by a decorator in the `modal` namespace

    The object will eventually by consumed by an App decorator.
    """

    raw_f: typing.Optional[collections.abc.Callable[modal._partial_function.P, modal._partial_function.ReturnType]]
    user_cls: typing.Optional[type]
    flags: modal._partial_function._PartialFunctionFlags
    params: modal._partial_function._PartialFunctionParams

    def __init__(
        self,
        obj: typing.Union[
            collections.abc.Callable[modal._partial_function.P, modal._partial_function.ReturnType], type
        ],
        flags: modal._partial_function._PartialFunctionFlags,
        params: modal._partial_function._PartialFunctionParams,
    ): ...
    def stack(
        self,
        flags: modal._partial_function._PartialFunctionFlags,
        params: modal._partial_function._PartialFunctionParams,
    ) -> typing_extensions.Self:
        """Implement decorator composition by combining the flags and params."""
        ...

    def validate_flag_composition(self) -> None:
        """Validate decorator composition based on PartialFunctionFlags."""
        ...

    def validate_obj_compatibility(
        self, decorator_name: str, require_sync: bool = False, require_nullary: bool = False
    ) -> None:
        """Enforce compatibility with the wrapped object; called from individual decorator functions."""
        ...

    def _get_raw_f(self) -> collections.abc.Callable[modal._partial_function.P, modal._partial_function.ReturnType]: ...
    def _is_web_endpoint(self) -> bool: ...
    def __get__(
        self, obj, objtype=None
    ) -> modal.functions.Function[
        modal._partial_function.P, modal._partial_function.ReturnType, modal._partial_function.OriginalReturnType
    ]: ...

def method(
    _warn_parentheses_missing=None, *, is_generator: typing.Optional[bool] = None
) -> modal._partial_function._MethodDecoratorType:
    """Decorator for methods that should be transformed into a Modal Function registered against this class's App.

    **Usage:**

    ```python
    @app.cls(cpu=8)
    class MyCls:

        @modal.method()
        def f(self):
            ...
    ```
    """
    ...

def web_endpoint(
    _warn_parentheses_missing=None,
    *,
    method: str = "GET",
    label: typing.Optional[str] = None,
    docs: bool = False,
    custom_domains: typing.Optional[collections.abc.Iterable[str]] = None,
    requires_proxy_auth: bool = False,
) -> collections.abc.Callable[
    [
        typing.Union[
            PartialFunction[
                modal._partial_function.P, modal._partial_function.ReturnType, modal._partial_function.ReturnType
            ],
            collections.abc.Callable[modal._partial_function.P, modal._partial_function.ReturnType],
        ]
    ],
    PartialFunction[modal._partial_function.P, modal._partial_function.ReturnType, modal._partial_function.ReturnType],
]:
    """Register a basic web endpoint with this application.

    DEPRECATED: This decorator has been renamed to `@modal.fastapi_endpoint`.

    This is the simple way to create a web endpoint on Modal. The function
    behaves as a [FastAPI](https://fastapi.tiangolo.com/) handler and should
    return a response object to the caller.

    Endpoints created with `@modal.web_endpoint` are meant to be simple, single
    request handlers and automatically have
    [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) enabled.
    For more flexibility, use `@modal.asgi_app`.

    To learn how to use Modal with popular web frameworks, see the
    [guide on web endpoints](https://modal.com/docs/guide/webhooks).
    """
    ...

def fastapi_endpoint(
    _warn_parentheses_missing=None,
    *,
    method: str = "GET",
    label: typing.Optional[str] = None,
    custom_domains: typing.Optional[collections.abc.Iterable[str]] = None,
    docs: bool = False,
    requires_proxy_auth: bool = False,
) -> collections.abc.Callable[
    [
        typing.Union[
            PartialFunction[
                modal._partial_function.P, modal._partial_function.ReturnType, modal._partial_function.ReturnType
            ],
            collections.abc.Callable[modal._partial_function.P, modal._partial_function.ReturnType],
        ]
    ],
    PartialFunction[modal._partial_function.P, modal._partial_function.ReturnType, modal._partial_function.ReturnType],
]:
    """Convert a function into a basic web endpoint by wrapping it with a FastAPI App.

    Modal will internally use [FastAPI](https://fastapi.tiangolo.com/) to expose a
    simple, single request handler. If you are defining your own `FastAPI` application
    (e.g. if you want to define multiple routes), use `@modal.asgi_app` instead.

    The endpoint created with this decorator will automatically have
    [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) enabled
    and can leverage many of FastAPI's features.

    For more information on using Modal with popular web frameworks, see our
    [guide on web endpoints](https://modal.com/docs/guide/webhooks).

    *Added in v0.73.82*: This function replaces the deprecated `@web_endpoint` decorator.
    """
    ...

def asgi_app(
    _warn_parentheses_missing=None,
    *,
    label: typing.Optional[str] = None,
    custom_domains: typing.Optional[collections.abc.Iterable[str]] = None,
    requires_proxy_auth: bool = False,
) -> collections.abc.Callable[
    [
        typing.Union[
            PartialFunction,
            collections.abc.Callable[[], typing.Any],
            collections.abc.Callable[[typing.Any], typing.Any],
        ]
    ],
    PartialFunction,
]:
    """Decorator for registering an ASGI app with a Modal function.

    Asynchronous Server Gateway Interface (ASGI) is a standard for Python
    synchronous and asynchronous apps, supported by all popular Python web
    libraries. This is an advanced decorator that gives full flexibility in
    defining one or more web endpoints on Modal.

    **Usage:**

    ```python
    from typing import Callable

    @app.function()
    @modal.asgi_app()
    def create_asgi() -> Callable:
        ...
    ```

    To learn how to use Modal with popular web frameworks, see the
    [guide on web endpoints](https://modal.com/docs/guide/webhooks).
    """
    ...

def wsgi_app(
    _warn_parentheses_missing=None,
    *,
    label: typing.Optional[str] = None,
    custom_domains: typing.Optional[collections.abc.Iterable[str]] = None,
    requires_proxy_auth: bool = False,
) -> collections.abc.Callable[
    [
        typing.Union[
            PartialFunction,
            collections.abc.Callable[[], typing.Any],
            collections.abc.Callable[[typing.Any], typing.Any],
        ]
    ],
    PartialFunction,
]:
    """Decorator for registering a WSGI app with a Modal function.

    Web Server Gateway Interface (WSGI) is a standard for synchronous Python web apps.
    It has been [succeeded by the ASGI interface](https://asgi.readthedocs.io/en/latest/introduction.html#wsgi-compatibility)
    which is compatible with ASGI and supports additional functionality such as web sockets.
    Modal supports ASGI via [`asgi_app`](https://modal.com/docs/reference/modal.asgi_app).

    **Usage:**

    ```python
    from typing import Callable

    @app.function()
    @modal.wsgi_app()
    def create_wsgi() -> Callable:
        ...
    ```

    To learn how to use this decorator with popular web frameworks, see the
    [guide on web endpoints](https://modal.com/docs/guide/webhooks).
    """
    ...

def web_server(
    port: int,
    *,
    startup_timeout: float = 5.0,
    label: typing.Optional[str] = None,
    custom_domains: typing.Optional[collections.abc.Iterable[str]] = None,
    requires_proxy_auth: bool = False,
) -> collections.abc.Callable[
    [
        typing.Union[
            PartialFunction,
            collections.abc.Callable[[], typing.Any],
            collections.abc.Callable[[typing.Any], typing.Any],
        ]
    ],
    PartialFunction,
]:
    """Decorator that registers an HTTP web server inside the container.

    This is similar to `@asgi_app` and `@wsgi_app`, but it allows you to expose a full HTTP server
    listening on a container port. This is useful for servers written in other languages like Rust,
    as well as integrating with non-ASGI frameworks like aiohttp and Tornado.

    **Usage:**

    ```python
    import subprocess

    @app.function()
    @modal.web_server(8000)
    def my_file_server():
        subprocess.Popen("python -m http.server -d / 8000", shell=True)
    ```

    The above example starts a simple file server, displaying the contents of the root directory.
    Here, requests to the web endpoint will go to external port 8000 on the container. The
    `http.server` module is included with Python, but you could run anything here.

    Internally, the web server is transparently converted into a web endpoint by Modal, so it has
    the same serverless autoscaling behavior as other web endpoints.

    For more info, see the [guide on web endpoints](https://modal.com/docs/guide/webhooks).
    """
    ...

def enter(
    _warn_parentheses_missing=None, *, snap: bool = False
) -> collections.abc.Callable[
    [typing.Union[PartialFunction, collections.abc.Callable[[typing.Any], typing.Any]]], PartialFunction
]:
    """Decorator for methods which should be executed when a new container is started.

    See the [lifeycle function guide](https://modal.com/docs/guide/lifecycle-functions#enter) for more information.
    """
    ...

def exit(
    _warn_parentheses_missing=None,
) -> collections.abc.Callable[[collections.abc.Callable[[typing.Any], typing.Any]], PartialFunction]:
    """Decorator for methods which should be executed when a container is about to exit.

    See the [lifeycle function guide](https://modal.com/docs/guide/lifecycle-functions#exit) for more information.
    """
    ...

def batched(
    _warn_parentheses_missing=None, *, max_batch_size: int, wait_ms: int
) -> collections.abc.Callable[
    [
        typing.Union[
            PartialFunction[
                modal._partial_function.P, modal._partial_function.ReturnType, modal._partial_function.ReturnType
            ],
            collections.abc.Callable[modal._partial_function.P, modal._partial_function.ReturnType],
        ]
    ],
    PartialFunction[modal._partial_function.P, modal._partial_function.ReturnType, modal._partial_function.ReturnType],
]:
    """Decorator for functions or class methods that should be batched.

    **Usage**

    ```python
    # Stack the decorator under `@app.function()` to enable dynamic batching
    @app.function()
    @modal.batched(max_batch_size=4, wait_ms=1000)
    async def batched_multiply(xs: list[int], ys: list[int]) -> list[int]:
        return [x * y for x, y in zip(xs, ys)]

    # call batched_multiply with individual inputs
    # batched_multiply.remote.aio(2, 100)

    # With `@app.cls()`, apply the decorator to a method (this may change in the future)
    @app.cls()
    class BatchedClass:
        @modal.batched(max_batch_size=4, wait_ms=1000)
        def batched_multiply(self, xs: list[int], ys: list[int]) -> list[int]:
            return [x * y for x, y in zip(xs, ys)]
    ```

    See the [dynamic batching guide](https://modal.com/docs/guide/dynamic-batching) for more information.
    """
    ...

def concurrent(
    _warn_parentheses_missing=None,
    *,
    max_inputs: typing.Optional[int] = None,
    target_inputs: typing.Optional[int] = None,
) -> collections.abc.Callable[
    [
        typing.Union[
            PartialFunction[
                modal._partial_function.P, modal._partial_function.ReturnType, modal._partial_function.ReturnType
            ],
            collections.abc.Callable[modal._partial_function.P, modal._partial_function.ReturnType],
        ]
    ],
    PartialFunction[modal._partial_function.P, modal._partial_function.ReturnType, modal._partial_function.ReturnType],
]:
    """Decorator that allows individual containers to handle multiple inputs concurrently.

    The concurrency mechanism depends on whether the function is async or not:
    - Async functions will run inputs on a single thread as asyncio tasks.
    - Synchronous functions will use multi-threading. The code must be thread-safe.

    Input concurrency will be most useful for workflows that are IO-bound
    (e.g., making network requests) or when running an inference server that supports
    dynamic batching.

    When `target_inputs` is set, Modal's autoscaler will try to provision resources
    such that each container is running that many inputs concurrently, rather than
    autoscaling based on `max_inputs`. Containers may burst up to up to `max_inputs`
    if resources are insufficient to remain at the target concurrency, e.g. when the
    arrival rate of inputs increases. This can trade-off a small increase in average
    latency to avoid larger tail latencies from input queuing.

    **Examples:**
    ```python
    # Stack the decorator under `@app.function()` to enable input concurrency
    @app.function()
    @modal.concurrent(max_inputs=100)
    async def f(data):
        # Async function; will be scheduled as asyncio task
        ...

    # With `@app.cls()`, apply the decorator at the class level, not on individual methods
    @app.cls()
    @modal.concurrent(max_inputs=100, target_inputs=80)
    class C:
        @modal.method()
        def f(self, data):
            # Sync function; must be thread-safe
            ...

    ```

    *Added in v0.73.148:* This decorator replaces the `allow_concurrent_inputs` parameter
    in `@app.function()` and `@app.cls()`.
    """
    ...
