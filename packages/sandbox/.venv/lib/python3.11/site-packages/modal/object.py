# Copyright Modal Labs 2025
from ._object import _Object
from ._utils.async_utils import synchronize_api

Object = synchronize_api(_Object, target_module=__name__)
