# Copyright Modal Labs 2025

from ._partial_function import (
    _asgi_app,
    _batched,
    _concurrent,
    _enter,
    _exit,
    _fastapi_endpoint,
    _method,
    _PartialFunction,
    _web_endpoint,
    _web_server,
    _wsgi_app,
)
from ._utils.async_utils import synchronize_api

# The only reason these are wrapped is to get translated type stubs, they
# don't actually run any async code as of 2025-02-04:
PartialFunction = synchronize_api(_PartialFunction, target_module=__name__)
method = synchronize_api(_method, target_module=__name__)
web_endpoint = synchronize_api(_web_endpoint, target_module=__name__)
fastapi_endpoint = synchronize_api(_fastapi_endpoint, target_module=__name__)
asgi_app = synchronize_api(_asgi_app, target_module=__name__)
wsgi_app = synchronize_api(_wsgi_app, target_module=__name__)
web_server = synchronize_api(_web_server, target_module=__name__)
enter = synchronize_api(_enter, target_module=__name__)
exit = synchronize_api(_exit, target_module=__name__)
batched = synchronize_api(_batched, target_module=__name__)
concurrent = synchronize_api(_concurrent, target_module=__name__)
