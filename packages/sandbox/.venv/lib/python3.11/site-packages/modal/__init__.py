# Copyright Modal Labs 2022
import sys

if sys.version_info[:2] < (3, 10):
    raise RuntimeError("This version of Modal requires at least Python 3.10")
if sys.version_info[:2] >= (3, 15):
    raise RuntimeError("This version of Modal does not support Python 3.15+")

from modal_version import __version__

try:
    from ._runtime.execution_context import current_function_call_id, current_input_id, interact, is_local
    from ._tunnel import Tunnel, forward
    from .app import App
    from .client import Client
    from .cloud_bucket_mount import CloudBucketMount
    from .cls import Cls, parameter
    from .dict import Dict
    from .exception import Error
    from .file_pattern_matcher import FilePatternMatcher
    from .functions import Function, FunctionCall
    from .image import Image
    from .network_file_system import NetworkFileSystem
    from .output import enable_output
    from .partial_function import (
        asgi_app,
        batched,
        concurrent,
        enter,
        exit,
        fastapi_endpoint,
        method,
        web_endpoint,
        web_server,
        wsgi_app,
    )
    from .proxy import Proxy
    from .queue import Queue
    from .retries import Retries
    from .sandbox import Sandbox
    from .schedule import Cron, Period
    from .scheduler_placement import SchedulerPlacement
    from .secret import Secret
    from .server import Server
    from .snapshot import SandboxSnapshot
    from .volume import Volume
except Exception:
    print()
    print("#" * 80)
    print("#" + "Something with the Modal installation seems broken.".center(78) + "#")
    print("#" + "Please email support@modal.com and we will try to help!".center(78) + "#")
    print("#" * 80)
    print()
    raise


__all__ = [
    "__version__",
    "App",
    "Client",
    "Cls",
    "Cron",
    "Dict",
    "Error",
    "FilePatternMatcher",
    "Function",
    "FunctionCall",
    "Image",
    "NetworkFileSystem",
    "Period",
    "Proxy",
    "Queue",
    "Retries",
    "CloudBucketMount",
    "Sandbox",
    "SandboxSnapshot",
    "SchedulerPlacement",
    "Secret",
    "Server",
    "Tunnel",
    "Volume",
    "asgi_app",
    "batched",
    "concurrent",
    "current_function_call_id",
    "current_input_id",
    "enable_output",
    "enter",
    "exit",
    "fastapi_endpoint",
    "forward",
    "is_local",
    "interact",
    "method",
    "parameter",
    "web_endpoint",
    "web_server",
    "wsgi_app",
]


def __getattr__(name):
    if name == "Stub":
        raise AttributeError(
            "Module 'modal' has no attribute 'Stub'. Use `modal.App` instead. This is a simple name change."
        )
    raise AttributeError(f"module 'modal' has no attribute '{name}'")
