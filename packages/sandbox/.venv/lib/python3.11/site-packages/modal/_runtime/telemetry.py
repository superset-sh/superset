# Copyright Modal Labs 2024

import importlib.abc
import json
import queue
import socket
import sys
import threading
import time
import uuid
from importlib.util import find_spec, module_from_spec
from struct import pack

from modal.config import logger

MODULE_LOAD_START = "module_load_start"
MODULE_LOAD_END = "module_load_end"

MESSAGE_HEADER_FORMAT = "<I"
MESSAGE_HEADER_LEN = 4


class InterceptedModuleLoader(importlib.abc.Loader):
    def __init__(self, name, loader, interceptor):
        self.name = name
        self.loader = loader
        self.interceptor = interceptor

    def exec_module(self, module):
        if self.loader is None:
            return
        try:
            self.loader.exec_module(module)
        finally:
            self.interceptor.load_end(self.name)

    def create_module(self, spec):
        spec.loader = self.loader
        module = module_from_spec(spec)
        spec.loader = self
        return module

    def get_data(self, path: str) -> bytes:
        """
        Implementation is required to support pkgutil.get_data.

        > If the package cannot be located or loaded, or it uses a loader which does
        > not support get_data, then None is returned.

        ref: https://docs.python.org/3/library/pkgutil.html#pkgutil.get_data
        """
        return self.loader.get_data(path)

    def get_resource_reader(self, fullname: str):
        """
        Support reading a binary artifact that is shipped within a package.

        > Loaders that wish to support resource reading are expected to provide a method called
        > get_resource_reader(fullname) which returns an object implementing this ABC’s interface.

        ref: docs.python.org/3.10/library/importlib.html?highlight=traversableresources#importlib.abc.ResourceReader
        """
        return self.loader.get_resource_reader(fullname)


class ImportInterceptor(importlib.abc.MetaPathFinder):
    loading: dict[str, tuple[str, float]]
    tracing_socket: socket.socket
    events: queue.Queue

    @classmethod
    def connect(cls, socket_filename: str) -> "ImportInterceptor":
        tracing_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        tracing_socket.connect(socket_filename)
        return cls(tracing_socket)

    def __init__(self, tracing_socket: socket.socket):
        self.loading = {}
        self.tracing_socket = tracing_socket
        self.events = queue.Queue(maxsize=16 * 1024)
        sender = threading.Thread(target=self._send, daemon=True)
        sender.start()

    def find_spec(self, fullname, path, target=None):
        if fullname in self.loading:
            return None
        self.load_start(fullname)
        spec = find_spec(fullname)
        if spec is None:
            self.load_end(fullname)
            return None
        spec.loader = InterceptedModuleLoader(fullname, spec.loader, self)
        return spec

    def load_start(self, name):
        t0 = time.monotonic()
        span_id = str(uuid.uuid4())
        self.emit(
            {"span_id": span_id, "timestamp": time.time(), "event": MODULE_LOAD_START, "attributes": {"name": name}}
        )
        self.loading[name] = (span_id, t0)

    def load_end(self, name):
        span_id, t0 = self.loading.pop(name, (None, None))
        if t0 is None:
            return
        latency = time.monotonic() - t0
        self.emit(
            {
                "span_id": span_id,
                "timestamp": time.time(),
                "event": MODULE_LOAD_END,
                "attributes": {
                    "name": name,
                    "latency": latency,
                },
            }
        )

    def emit(self, event):
        try:
            self.events.put_nowait(event)
        except queue.Full:
            logger.debug("failed to emit event: queue full")

    def _send(self):
        while True:
            event = self.events.get()
            try:
                msg = json.dumps(event).encode("utf-8")
            except BaseException as e:
                logger.debug(f"failed to serialize event: {e}")
                continue
            try:
                encoded_len = pack(MESSAGE_HEADER_FORMAT, len(msg))
                self.tracing_socket.send(encoded_len + msg)
            except OSError as e:
                logger.debug(f"failed to send event: {e}")

    def install(self):
        sys.meta_path = [self] + sys.meta_path  # type: ignore

    def remove(self):
        sys.meta_path.remove(self)  # type: ignore

    def __enter__(self):
        self.install()

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.remove()


def _instrument_imports(socket_filename: str):
    if not supported_platform():
        logger.debug("unsupported platform, not instrumenting imports")
        return
    interceptor = ImportInterceptor.connect(socket_filename)
    interceptor.install()


def instrument_imports(socket_filename: str):
    try:
        _instrument_imports(socket_filename)
    except BaseException as e:
        logger.warning(f"failed to instrument imports: {e}")


def supported_platform():
    return sys.platform in ("linux", "darwin")
