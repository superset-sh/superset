# Copyright Modal Labs 2026
from ._server import _Server
from ._utils.async_utils import synchronize_api

Server = synchronize_api(_Server, target_module=__name__)
