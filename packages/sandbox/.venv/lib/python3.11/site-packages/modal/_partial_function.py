# Copyright Modal Labs 2023
import enum
import inspect
import typing
from collections.abc import Coroutine, Iterable
from dataclasses import asdict, dataclass
from typing import (
    Any,
    Callable,
    Optional,
    Union,
)

import typing_extensions

from modal_proto import api_pb2

from ._functions import _Function
from ._utils.async_utils import synchronizer
from ._utils.deprecation import deprecation_warning
from ._utils.function_utils import callable_has_non_self_params
from .config import config
from .exception import InvalidError

MAX_MAX_BATCH_SIZE = 1000
MAX_BATCH_WAIT_MS = 10 * 60 * 1000  # 10 minutes

if typing.TYPE_CHECKING:
    import modal.partial_function


class _PartialFunctionFlags(enum.IntFlag):
    # Lifecycle method flags
    ENTER_PRE_SNAPSHOT = 2
    ENTER_POST_SNAPSHOT = 4
    EXIT = 8
    # Interface flags
    CALLABLE_INTERFACE = 16
    WEB_INTERFACE = 32
    # Service decorator flags
    # It's, unclear if we need these, as we can also generally infer based on some params being set
    # In the current state where @modal.batched is used _instead_ of `@modal.method`, we need to give
    # `@modal.batched` two roles (exposing the callable interface, adding batching semantics).
    # But it's probably better to make `@modal.batched` and `@modal.method` stackable, or to move
    # `@modal.batched` to be a class-level decorator since it primarily governs service behavior.
    BATCHED = 64
    CONCURRENT = 128
    CLUSTERED = 256  # Experimental: Clustered functions
    HTTP_WEB_INTERFACE = 512  # Experimental: HTTP server

    @staticmethod
    def all() -> int:
        return ~_PartialFunctionFlags(0)

    @staticmethod
    def lifecycle_flags() -> int:
        return (
            _PartialFunctionFlags.ENTER_PRE_SNAPSHOT
            | _PartialFunctionFlags.ENTER_POST_SNAPSHOT
            | _PartialFunctionFlags.EXIT
        )

    @staticmethod
    def interface_flags() -> int:
        return _PartialFunctionFlags.CALLABLE_INTERFACE | _PartialFunctionFlags.WEB_INTERFACE


@dataclass
class _PartialFunctionParams:
    webhook_config: Optional[api_pb2.WebhookConfig] = None
    is_generator: Optional[bool] = None
    force_build: Optional[bool] = None
    batch_max_size: Optional[int] = None
    batch_wait_ms: Optional[int] = None
    cluster_size: Optional[int] = None
    max_concurrent_inputs: Optional[int] = None
    target_concurrent_inputs: Optional[int] = None
    build_timeout: Optional[int] = None
    rdma: Optional[bool] = None
    http_config: Optional[api_pb2.HTTPConfig] = None

    def update(self, other: "_PartialFunctionParams") -> None:
        """Update self with params set in other."""
        for key, val in asdict(other).items():
            if val is not None:
                if getattr(self, key, None) is not None:
                    raise InvalidError(f"Cannot set `{key}` twice.")
                setattr(self, key, val)


P = typing_extensions.ParamSpec("P")
ReturnType = typing_extensions.TypeVar("ReturnType", covariant=True)
OriginalReturnType = typing_extensions.TypeVar("OriginalReturnType", covariant=True)
NullaryFuncOrMethod = Union[Callable[[], Any], Callable[[Any], Any]]
NullaryMethod = Callable[[Any], Any]


def verify_concurrent_params(params: _PartialFunctionParams, is_flash: bool = False) -> None:
    def _verify_concurrent_params_with_flash_settings(params: _PartialFunctionParams) -> None:
        if params.max_concurrent_inputs is not None:
            raise TypeError(
                "@modal.concurrent(max_inputs=...) is not yet supported for Flash functions. "
                "Use `@modal.concurrent(target_inputs=...)` instead."
            )
        if params.target_concurrent_inputs is None:
            raise TypeError("`@modal.concurrent()` missing required argument: `target_inputs`.")

    def _verify_concurrent_params(params: _PartialFunctionParams) -> None:
        if params.max_concurrent_inputs is None:
            raise TypeError("`@modal.concurrent()` missing required argument: `max_inputs`.")

    if is_flash:
        _verify_concurrent_params_with_flash_settings(params)
    else:
        _verify_concurrent_params(params)


class _PartialFunction(typing.Generic[P, ReturnType, OriginalReturnType]):
    """Object produced by a decorator in the `modal` namespace

    The object will eventually by consumed by an App decorator.
    """

    raw_f: Optional[Callable[P, ReturnType]]  # function or method
    user_cls: Optional[type] = None  # class
    flags: _PartialFunctionFlags
    params: _PartialFunctionParams

    def __init__(
        self,
        obj: Union[Callable[P, ReturnType], type],
        flags: _PartialFunctionFlags,
        params: _PartialFunctionParams,
    ):
        if isinstance(obj, type):
            self.user_cls = obj
            self.raw_f = None
        else:
            self.raw_f = obj
            self.user_cls = None
        self.flags = flags
        self.params = params
        self.validate_flag_composition()

    def stack(self, flags: _PartialFunctionFlags, params: _PartialFunctionParams) -> typing_extensions.Self:
        """Implement decorator composition by combining the flags and params."""
        self.flags |= flags
        self.params.update(params)
        self.validate_flag_composition()
        return self

    def validate_flag_composition(self) -> None:
        """Validate decorator composition based on PartialFunctionFlags."""
        uses_interface_flags = self.flags & _PartialFunctionFlags.interface_flags()
        uses_lifecycle_flags = self.flags & _PartialFunctionFlags.lifecycle_flags()
        if uses_interface_flags and uses_lifecycle_flags:
            raise InvalidError("Interface decorators cannot be combined with lifecycle decorators.")

        has_web_interface = self.flags & _PartialFunctionFlags.WEB_INTERFACE
        has_callable_interface = self.flags & _PartialFunctionFlags.CALLABLE_INTERFACE
        if has_web_interface and has_callable_interface:
            raise InvalidError("Callable decorators cannot be combined with web interface decorators.")

    def validate_obj_compatibility(
        self, decorator_name: str, require_sync: bool = False, require_nullary: bool = False
    ) -> None:
        """Enforce compatibility with the wrapped object; called from individual decorator functions."""
        from .cls import _Cls  # Avoid circular import

        uses_lifecycle_flags = self.flags & _PartialFunctionFlags.lifecycle_flags()
        uses_interface_flags = self.flags & _PartialFunctionFlags.interface_flags()
        if self.user_cls is not None and (uses_lifecycle_flags or uses_interface_flags):
            raise InvalidError(
                f"Cannot apply `@modal.{decorator_name}` to a class. Hint: consider applying to a method instead."
            )

        wrapped_object = self.raw_f or self.user_cls
        if isinstance(wrapped_object, _Function):
            raise InvalidError(
                f"Cannot stack `@modal.{decorator_name}` on top of `@app.function`."
                " Hint: swap the order of the decorators."
            )
        elif isinstance(wrapped_object, _Cls):
            raise InvalidError(
                f"Cannot stack `@modal.{decorator_name}` on top of `@app.cls()`."
                " Hint: swap the order of the decorators."
            )

        # Run some assertions about a callable wrappee defined by the specific decorator used
        if self.raw_f is not None:
            if not callable(self.raw_f):
                raise InvalidError(f"The object wrapped by `@modal.{decorator_name}` must be callable.")

            if require_sync and inspect.iscoroutinefunction(self.raw_f):
                raise InvalidError(f"The `@modal.{decorator_name}` decorator can't be applied to an async function.")

            if require_nullary and callable_has_non_self_params(self.raw_f):
                raise InvalidError(f"Functions decorated by `@modal.{decorator_name}` can't have parameters.")

    def _get_raw_f(self) -> Callable[P, ReturnType]:
        assert self.raw_f is not None
        return self.raw_f

    def _is_web_endpoint(self) -> bool:
        if self.params.webhook_config is None:
            return False
        return self.params.webhook_config.type != api_pb2.WEBHOOK_TYPE_UNSPECIFIED

    def __get__(self, obj, objtype=None) -> _Function[P, ReturnType, OriginalReturnType]:
        # to type checkers, any @method or similar function on a modal class, would appear to be
        # of the type PartialFunction and this descriptor would be triggered when accessing it,
        #
        # However, modal classes are *actually* Cls instances (which isn't reflected in type checkers
        # due to Python's lack of type checking intersection types), so at runtime the Cls instance would
        # use its __getattr__ rather than this descriptor.
        assert self.raw_f is not None  # Should only be relevant in a method context
        k = self.raw_f.__name__
        if obj:  # accessing the method on an instance of a class, e.g. `MyClass().fun``
            if hasattr(obj, "_modal_functions"):
                # This happens inside "local" user methods when they refer to other methods,
                # e.g. Foo().parent_method.remote() calling self.other_method.remote()
                return getattr(obj, "_modal_functions")[k]
            else:
                # special edge case: referencing a method of an instance of an
                # unwrapped class (not using app.cls()) with @methods
                # not sure what would be useful here, but let's return a bound version of the underlying function,
                # since the class is just a vanilla class at this point
                # This wouldn't let the user access `.remote()` and `.local()` etc. on the function
                return self.raw_f.__get__(obj, objtype)

        else:  # accessing a method directly on the class, e.g. `MyClass.fun`
            # This happens mainly during serialization of the obj underlying class of a Cls
            # since we don't have the instance info here we just return the PartialFunction itself
            # to let it be bound to a variable and become a Function later on
            return self  # type: ignore  # this returns a PartialFunction in a special internal case


def _find_partial_methods_for_user_cls(user_cls: type[Any], flags: int) -> dict[str, _PartialFunction]:
    """Grabs all method on a user class, and returns partials. Includes legacy methods."""
    from .partial_function import PartialFunction  # obj type

    partial_functions: dict[str, _PartialFunction] = {}
    for parent_cls in reversed(user_cls.mro()):
        if parent_cls is not object:
            for k, v in parent_cls.__dict__.items():
                if isinstance(v, PartialFunction):  # type: ignore[reportArgumentType]   # synchronicity wrapper types
                    _partial_function: _PartialFunction = typing.cast(_PartialFunction, synchronizer._translate_in(v))
                    if _partial_function.flags & flags:
                        partial_functions[k] = _partial_function

    return partial_functions


def _find_callables_for_obj(user_obj: Any, flags: int) -> dict[str, Callable[..., Any]]:
    """Grabs all methods for an object, and binds them to the class"""
    user_cls: type = type(user_obj)
    return {
        k: pf.raw_f.__get__(user_obj)
        for k, pf in _find_partial_methods_for_user_cls(user_cls, flags).items()
        if pf.raw_f is not None  # Should be true for output of _find_partial_methods_for_user_cls, but hard to annotate
    }


class _MethodDecoratorType:
    @typing.overload
    def __call__(
        self,
        func: "modal.partial_function.PartialFunction[typing_extensions.Concatenate[Any, P], ReturnType, OriginalReturnType]",  # noqa
    ) -> "modal.partial_function.PartialFunction[P, ReturnType, OriginalReturnType]": ...

    @typing.overload
    def __call__(
        self, func: "Callable[typing_extensions.Concatenate[Any, P], Coroutine[Any, Any, ReturnType]]"
    ) -> "modal.partial_function.PartialFunction[P, ReturnType, Coroutine[Any, Any, ReturnType]]": ...

    @typing.overload
    def __call__(
        self, func: "Callable[typing_extensions.Concatenate[Any, P], ReturnType]"
    ) -> "modal.partial_function.PartialFunction[P, ReturnType, ReturnType]": ...

    def __call__(self, func): ...


# TODO(elias): fix support for coroutine type unwrapping for methods (static typing)
def _method(
    _warn_parentheses_missing=None,  # mdmd:line-hidden
    *,
    # Set this to True if it's a non-generator function returning
    # a [sync/async] generator object
    is_generator: Optional[bool] = None,
) -> _MethodDecoratorType:
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
    if _warn_parentheses_missing is not None:
        raise InvalidError(
            "Positional arguments are not allowed. Did you forget parentheses? Suggestion: `@modal.method()`."
        )

    def wrapper(obj: Union[Callable[..., Any], _PartialFunction]) -> _PartialFunction:
        flags = _PartialFunctionFlags.CALLABLE_INTERFACE

        nonlocal is_generator  # TODO(michael): we are likely to deprecate the explicit is_generator param
        if is_generator is None:
            callable = obj.raw_f if isinstance(obj, _PartialFunction) else obj
            is_generator = inspect.isgeneratorfunction(callable) or inspect.isasyncgenfunction(callable)
        params = _PartialFunctionParams(is_generator=is_generator)

        if isinstance(obj, _PartialFunction):
            pf = obj.stack(flags, params)
        else:
            pf = _PartialFunction(obj, flags, params)
        pf.validate_obj_compatibility("method")
        return pf

    # TODO(michael) verify that we still need the type: ignore
    return wrapper  # type: ignore  # synchronicity issue with obj vs unwrapped types and protocols


def _parse_custom_domains(custom_domains: Optional[Iterable[str]] = None) -> list[api_pb2.CustomDomainConfig]:
    assert not isinstance(custom_domains, str), "custom_domains must be `Iterable[str]` but is `str` instead."
    _custom_domains: list[api_pb2.CustomDomainConfig] = []
    if custom_domains is not None:
        for custom_domain in custom_domains:
            _custom_domains.append(api_pb2.CustomDomainConfig(name=custom_domain))

    return _custom_domains


def _fastapi_endpoint(
    _warn_parentheses_missing=None,  # mdmd:line-hidden
    *,
    method: str = "GET",  # REST method for the created endpoint.
    label: Optional[str] = None,  # Label for created endpoint. Final subdomain will be <workspace>--<label>.modal.run.
    custom_domains: Optional[Iterable[str]] = None,  # Custom fully-qualified domain name (FQDN) for the endpoint.
    docs: bool = False,  # Whether to enable interactive documentation for this endpoint at /docs.
    requires_proxy_auth: bool = False,  # Require Modal-Key and Modal-Secret HTTP Headers on requests.
) -> Callable[
    [Union[_PartialFunction[P, ReturnType, ReturnType], Callable[P, ReturnType]]],
    _PartialFunction[P, ReturnType, ReturnType],
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
    if isinstance(_warn_parentheses_missing, str):
        # Probably passing the method string as a positional argument.
        raise InvalidError(
            f'Positional arguments are not allowed. Suggestion: `@modal.fastapi_endpoint(method="{method}")`.'
        )
    elif _warn_parentheses_missing is not None:
        raise InvalidError(
            "Positional arguments are not allowed. Did you forget parentheses? Suggestion: `@modal.fastapi_endpoint()`."
        )

    webhook_config = api_pb2.WebhookConfig(
        type=api_pb2.WEBHOOK_TYPE_FUNCTION,
        method=method,
        web_endpoint_docs=docs,
        requested_suffix=label or "",
        ephemeral_suffix=config.get("dev_suffix"),
        async_mode=api_pb2.WEBHOOK_ASYNC_MODE_AUTO,
        custom_domains=_parse_custom_domains(custom_domains),
        requires_proxy_auth=requires_proxy_auth,
    )

    flags = _PartialFunctionFlags.WEB_INTERFACE
    params = _PartialFunctionParams(webhook_config=webhook_config)

    def wrapper(
        obj: Union[_PartialFunction[P, ReturnType, ReturnType], Callable[P, ReturnType]],
    ) -> _PartialFunction[P, ReturnType, ReturnType]:
        if isinstance(obj, _PartialFunction):
            pf = obj.stack(flags, params)
        else:
            pf = _PartialFunction(obj, flags, params)
        pf.validate_obj_compatibility("fastapi_endpoint")
        return pf

    return wrapper


def _web_endpoint(
    _warn_parentheses_missing=None,  # mdmd:line-hidden
    *,
    method: str = "GET",  # REST method for the created endpoint.
    label: Optional[str] = None,  # Label for created endpoint. Final subdomain will be <workspace>--<label>.modal.run.
    docs: bool = False,  # Whether to enable interactive documentation for this endpoint at /docs.
    custom_domains: Optional[
        Iterable[str]
    ] = None,  # Create an endpoint using a custom domain fully-qualified domain name (FQDN).
    requires_proxy_auth: bool = False,  # Require Modal-Key and Modal-Secret HTTP Headers on requests.
) -> Callable[
    [Union[_PartialFunction[P, ReturnType, ReturnType], Callable[P, ReturnType]]],
    _PartialFunction[P, ReturnType, ReturnType],
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
    if isinstance(_warn_parentheses_missing, str):
        # Probably passing the method string as a positional argument.
        raise InvalidError('Positional arguments are not allowed. Suggestion: `@modal.web_endpoint(method="GET")`.')
    elif _warn_parentheses_missing is not None:
        raise InvalidError(
            "Positional arguments are not allowed. Did you forget parentheses? Suggestion: `@modal.web_endpoint()`."
        )

    deprecation_warning(
        (2025, 3, 5), "The `@modal.web_endpoint` decorator has been renamed to `@modal.fastapi_endpoint`."
    )

    webhook_config = api_pb2.WebhookConfig(
        type=api_pb2.WEBHOOK_TYPE_FUNCTION,
        method=method,
        web_endpoint_docs=docs,
        requested_suffix=label or "",
        ephemeral_suffix=config.get("dev_suffix"),
        async_mode=api_pb2.WEBHOOK_ASYNC_MODE_AUTO,
        custom_domains=_parse_custom_domains(custom_domains),
        requires_proxy_auth=requires_proxy_auth,
    )

    flags = _PartialFunctionFlags.WEB_INTERFACE
    params = _PartialFunctionParams(webhook_config=webhook_config)

    def wrapper(
        obj: Union[_PartialFunction[P, ReturnType, ReturnType], Callable[P, ReturnType]],
    ) -> _PartialFunction[P, ReturnType, ReturnType]:
        if isinstance(obj, _PartialFunction):
            pf = obj.stack(flags, params)
        else:
            pf = _PartialFunction(obj, flags, params)
        pf.validate_obj_compatibility("web_endpoint")
        return pf

    return wrapper


def _asgi_app(
    _warn_parentheses_missing=None,  # mdmd:line-hidden
    *,
    label: Optional[str] = None,  # Label for created endpoint. Final subdomain will be <workspace>--<label>.modal.run.
    custom_domains: Optional[Iterable[str]] = None,  # Deploy this endpoint on a custom domain.
    requires_proxy_auth: bool = False,  # Require Modal-Key and Modal-Secret HTTP Headers on requests.
) -> Callable[[Union[_PartialFunction, NullaryFuncOrMethod]], _PartialFunction]:
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
    if isinstance(_warn_parentheses_missing, str):
        raise InvalidError(f'Positional arguments are not allowed. Suggestion: `@modal.asgi_app(label="{label}")`.')
    elif _warn_parentheses_missing is not None:
        raise InvalidError(
            "Positional arguments are not allowed. Did you forget parentheses? Suggestion: `@modal.asgi_app()`."
        )

    webhook_config = api_pb2.WebhookConfig(
        type=api_pb2.WEBHOOK_TYPE_ASGI_APP,
        requested_suffix=label or "",
        ephemeral_suffix=config.get("dev_suffix"),
        async_mode=api_pb2.WEBHOOK_ASYNC_MODE_AUTO,
        custom_domains=_parse_custom_domains(custom_domains),
        requires_proxy_auth=requires_proxy_auth,
    )

    flags = _PartialFunctionFlags.WEB_INTERFACE
    params = _PartialFunctionParams(webhook_config=webhook_config)

    def wrapper(obj: Union[_PartialFunction, NullaryFuncOrMethod]) -> _PartialFunction:
        if isinstance(obj, _PartialFunction):
            pf = obj.stack(flags, params)
        else:
            pf = _PartialFunction(obj, flags, params)
        pf.validate_obj_compatibility("asgi_app", require_sync=True, require_nullary=True)
        return pf

    return wrapper


def _wsgi_app(
    _warn_parentheses_missing=None,  # mdmd:line-hidden
    *,
    label: Optional[str] = None,  # Label for created endpoint. Final subdomain will be <workspace>--<label>.modal.run.
    custom_domains: Optional[Iterable[str]] = None,  # Deploy this endpoint on a custom domain.
    requires_proxy_auth: bool = False,  # Require Modal-Key and Modal-Secret HTTP Headers on requests.
) -> Callable[[Union[_PartialFunction, NullaryFuncOrMethod]], _PartialFunction]:
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
    if isinstance(_warn_parentheses_missing, str):
        raise InvalidError(f'Positional arguments are not allowed. Suggestion: `@modal.wsgi_app(label="{label}")`.')
    elif _warn_parentheses_missing is not None:
        raise InvalidError(
            "Positional arguments are not allowed. Did you forget parentheses? Suggestion: `@modal.wsgi_app()`."
        )

    webhook_config = api_pb2.WebhookConfig(
        type=api_pb2.WEBHOOK_TYPE_WSGI_APP,
        requested_suffix=label or "",
        ephemeral_suffix=config.get("dev_suffix"),
        async_mode=api_pb2.WEBHOOK_ASYNC_MODE_AUTO,
        custom_domains=_parse_custom_domains(custom_domains),
        requires_proxy_auth=requires_proxy_auth,
    )

    flags = _PartialFunctionFlags.WEB_INTERFACE
    params = _PartialFunctionParams(webhook_config=webhook_config)

    def wrapper(obj: Union[_PartialFunction, NullaryFuncOrMethod]) -> _PartialFunction:
        if isinstance(obj, _PartialFunction):
            pf = obj.stack(flags, params)
        else:
            pf = _PartialFunction(obj, flags, params)
        pf.validate_obj_compatibility("wsgi_app", require_sync=True, require_nullary=True)
        return pf

    return wrapper


def _web_server(
    port: int,
    *,
    startup_timeout: float = 5.0,  # Maximum number of seconds to wait for the web server to start.
    label: Optional[str] = None,  # Label for created endpoint. Final subdomain will be <workspace>--<label>.modal.run.
    custom_domains: Optional[Iterable[str]] = None,  # Deploy this endpoint on a custom domain.
    requires_proxy_auth: bool = False,  # Require Modal-Key and Modal-Secret HTTP Headers on requests.
) -> Callable[[Union[_PartialFunction, NullaryFuncOrMethod]], _PartialFunction]:
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
    if not isinstance(port, int) or port < 1 or port > 65535:
        raise InvalidError("First argument of `@web_server` must be a local port, such as `@web_server(8000)`.")
    if startup_timeout <= 0:
        raise InvalidError("The `startup_timeout` argument of `@web_server` must be positive.")

    webhook_config = api_pb2.WebhookConfig(
        type=api_pb2.WEBHOOK_TYPE_WEB_SERVER,
        requested_suffix=label or "",
        ephemeral_suffix=config.get("dev_suffix"),
        async_mode=api_pb2.WEBHOOK_ASYNC_MODE_AUTO,
        custom_domains=_parse_custom_domains(custom_domains),
        web_server_port=port,
        web_server_startup_timeout=startup_timeout,
        requires_proxy_auth=requires_proxy_auth,
    )

    flags = _PartialFunctionFlags.WEB_INTERFACE
    params = _PartialFunctionParams(webhook_config=webhook_config)

    def wrapper(obj: Union[_PartialFunction, NullaryFuncOrMethod]) -> _PartialFunction:
        if isinstance(obj, _PartialFunction):
            pf = obj.stack(flags, params)
        else:
            pf = _PartialFunction(obj, flags, params)
        pf.validate_obj_compatibility("web_server", require_sync=True, require_nullary=True)
        return pf

    return wrapper


def _enter(
    _warn_parentheses_missing=None,  # mdmd:line-hidden
    *,
    snap: bool = False,
) -> Callable[[Union[_PartialFunction, NullaryMethod]], _PartialFunction]:
    """Decorator for methods which should be executed when a new container is started.

    See the [lifeycle function guide](https://modal.com/docs/guide/lifecycle-functions#enter) for more information."""
    if _warn_parentheses_missing is not None:
        raise InvalidError(
            "Positional arguments are not allowed. Did you forget parentheses? Suggestion: `@modal.enter()`."
        )

    flags = _PartialFunctionFlags.ENTER_PRE_SNAPSHOT if snap else _PartialFunctionFlags.ENTER_POST_SNAPSHOT
    params = _PartialFunctionParams()

    def wrapper(obj: Union[_PartialFunction, NullaryMethod]) -> _PartialFunction:
        # TODO: reject stacking once depreceate @modal.build
        if isinstance(obj, _PartialFunction):
            pf = obj.stack(flags, params)
        else:
            pf = _PartialFunction(obj, flags, params)
        pf.validate_obj_compatibility("enter")  # TODO require_nullary?
        return pf

    return wrapper


def _exit(_warn_parentheses_missing=None) -> Callable[[NullaryMethod], _PartialFunction]:
    """Decorator for methods which should be executed when a container is about to exit.

    See the [lifeycle function guide](https://modal.com/docs/guide/lifecycle-functions#exit) for more information."""
    if _warn_parentheses_missing is not None:
        raise InvalidError(
            "Positional arguments are not allowed. Did you forget parentheses? Suggestion: `@modal.exit()`."
        )

    flags = _PartialFunctionFlags.EXIT
    params = _PartialFunctionParams()

    def wrapper(obj: Union[_PartialFunction, NullaryMethod]) -> _PartialFunction:
        if isinstance(obj, _PartialFunction):
            pf = obj.stack(flags, params)
        else:
            pf = _PartialFunction(obj, flags, params)
        pf.validate_obj_compatibility("exit")  # TODO require_nullary?
        return pf

    return wrapper


def _batched(
    _warn_parentheses_missing=None,  # mdmd:line-hidden
    *,
    max_batch_size: int,
    wait_ms: int,
) -> Callable[
    [Union[_PartialFunction[P, ReturnType, ReturnType], Callable[P, ReturnType]]],
    _PartialFunction[P, ReturnType, ReturnType],
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
    if _warn_parentheses_missing is not None:
        raise InvalidError(
            "Positional arguments are not allowed. Did you forget parentheses? Suggestion: `@modal.batched()`."
        )
    if max_batch_size < 1:
        raise InvalidError("max_batch_size must be a positive integer.")
    if max_batch_size > MAX_MAX_BATCH_SIZE:
        raise InvalidError(f"max_batch_size cannot be greater than {MAX_MAX_BATCH_SIZE}.")
    if wait_ms < 0:
        raise InvalidError("wait_ms must be a non-negative integer.")
    if wait_ms > MAX_BATCH_WAIT_MS:
        raise InvalidError(f"wait_ms cannot be greater than {MAX_BATCH_WAIT_MS}.")

    flags = _PartialFunctionFlags.CALLABLE_INTERFACE | _PartialFunctionFlags.BATCHED
    params = _PartialFunctionParams(batch_max_size=max_batch_size, batch_wait_ms=wait_ms)

    def wrapper(
        obj: Union[_PartialFunction[P, ReturnType, ReturnType], Callable[P, ReturnType]],
    ) -> _PartialFunction[P, ReturnType, ReturnType]:
        if isinstance(obj, _PartialFunction):
            pf = obj.stack(flags, params)
        else:
            pf = _PartialFunction(obj, flags, params)
        pf.validate_obj_compatibility("batched")
        return pf

    return wrapper


def _concurrent(
    _warn_parentheses_missing=None,  # mdmd:line-hidden
    *,
    max_inputs: Optional[int] = None,  # Hard limit on each container's input concurrency
    target_inputs: Optional[int] = None,  # Input concurrency that Modal's autoscaler should target
) -> Callable[
    [Union[Callable[P, ReturnType], _PartialFunction[P, ReturnType, ReturnType]]],
    _PartialFunction[P, ReturnType, ReturnType],
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
    if _warn_parentheses_missing is not None:
        raise InvalidError(
            "Positional arguments are not allowed. Did you forget parentheses? Suggestion: `@modal.concurrent()`."
        )

    if max_inputs is not None and target_inputs is not None and target_inputs > max_inputs:
        raise InvalidError("`target_inputs` parameter cannot be greater than `max_inputs`.")

    flags = _PartialFunctionFlags.CONCURRENT
    params = _PartialFunctionParams(max_concurrent_inputs=max_inputs, target_concurrent_inputs=target_inputs)

    # Note: ideally we would have some way of declaring that this decorator cannot be used on an individual method.
    # I don't think there's any clear way for the wrapper function to know it's been passed "a method" rather than
    # a normal function. So we need to run that check in the `@app.cls` decorator, which is a little far removed.

    def wrapper(
        obj: Union[_PartialFunction[P, ReturnType, ReturnType], Callable[P, ReturnType]],
    ) -> _PartialFunction[P, ReturnType, ReturnType]:
        if isinstance(obj, _PartialFunction):
            pf = obj.stack(flags, params)
        else:
            pf = _PartialFunction(obj, flags, params)
        pf.validate_obj_compatibility("concurrent")
        return pf

    return wrapper


# NOTE: clustered is currently exposed through modal.experimental, not the top-level namespace
def _clustered(
    size: int, broadcast: bool = True, rdma: bool = False
) -> Callable[
    [Union[Callable[P, ReturnType], _PartialFunction[P, ReturnType, ReturnType]]],
    _PartialFunction[P, ReturnType, ReturnType],
]:
    """Provision clusters of colocated and networked containers for the Function.

    Parameters:
    size: int
        Number of containers spun up to handle each input.
    broadcast: bool = True
        If True, inputs will be sent simultaneously to each container. Otherwise,
        inputs will be sent only to the rank-0 container, which is responsible for
        delegating to the workers.
    """

    assert broadcast, "broadcast=False has not been implemented yet!"

    if size <= 0:
        raise ValueError("cluster size must be greater than 0")

    flags = _PartialFunctionFlags.CLUSTERED
    params = _PartialFunctionParams(cluster_size=size, rdma=rdma)

    def wrapper(
        obj: Union[_PartialFunction[P, ReturnType, ReturnType], Callable[P, ReturnType]],
    ) -> _PartialFunction[P, ReturnType, ReturnType]:
        if isinstance(obj, _PartialFunction):
            pf = obj.stack(flags, params)
        else:
            pf = _PartialFunction(obj, flags, params)
        pf.validate_obj_compatibility("clustered")
        return pf

    return wrapper
