# Copyright Modal Labs 2022
import asyncio
import inspect
import os
import typing
from collections.abc import AsyncGenerator
from enum import Enum
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Literal, Optional

from grpclib.exceptions import StreamTerminatedError

import modal_proto
from modal_proto import api_pb2
from modal_proto.modal_api_grpc import ModalClientModal

from .._serialization import (
    deserialize,
    deserialize_data_format,
    get_preferred_payload_format,
    serialize,
    serialize_data_format as _serialize_data_format,
    signature_to_parameter_specs,
)
from .._traceback import append_modal_tb
from ..config import logger
from ..exception import (
    DeserializationError,
    ExecutionError,
    FunctionTimeoutError,
    InternalError,
    InternalFailure,
    InvalidError,
    RemoteError,
    ServiceError,
)
from ..mount import ROOT_DIR, _is_modal_path, _Mount
from .blob_utils import (
    MAX_ASYNC_OBJECT_SIZE_BYTES,
    blob_download,
    blob_upload_with_r2_failure_info,
)

if typing.TYPE_CHECKING:
    import modal._functions


class FunctionInfoType(Enum):
    PACKAGE = "package"
    FILE = "file"
    SERIALIZED = "serialized"
    NOTEBOOK = "notebook"


class LocalFunctionError(InvalidError):
    """Raised if a function declared in a non-global scope is used in an impermissible way"""


def entrypoint_only_package_mount_condition(entrypoint_file):
    entrypoint_path = Path(entrypoint_file)

    def inner(filename):
        path = Path(filename)
        if path == entrypoint_path:
            return True
        if path.name == "__init__.py" and path.parent in entrypoint_path.parents:
            # ancestor __init__.py are included
            return True
        return False

    return inner


def is_global_object(object_qual_name: str):
    return "<locals>" not in object_qual_name.split(".")


def is_flash_object(experimental_options: Optional[dict[str, Any]], http_config: Optional[api_pb2.HTTPConfig]) -> bool:
    return bool(experimental_options and experimental_options.get("flash", False)) or http_config is not None


def is_method_fn(object_qual_name: str):
    # methods have names like Cls.foo.
    if "<locals>" in object_qual_name:
        # functions can be nested in multiple local scopes.
        rest = object_qual_name.split("<locals>.")[-1]
        return len(rest.split(".")) > 1
    return len(object_qual_name.split(".")) > 1


def is_top_level_function(f: Callable) -> bool:
    """Returns True if this function is defined in global scope.

    Returns False if this function is locally scoped (including on a class).
    """
    return f.__name__ == f.__qualname__


def is_async(function):
    # TODO: this is somewhat hacky. We need to know whether the function is async or not in order to
    # coerce the input arguments to the right type. The proper way to do is to call the function and
    # see if you get a coroutine (or async generator) back. However at this point, it's too late to
    # coerce the type. For now let's make a determination based on inspecting the function definition.
    # This sometimes isn't correct, since a "vanilla" Python function can return a coroutine if it
    # wraps async code or similar. Let's revisit this shortly.
    if inspect.ismethod(function):
        function = function.__func__  # inspect the underlying function
    if inspect.iscoroutinefunction(function) or inspect.isasyncgenfunction(function):
        return True
    elif inspect.isfunction(function) or inspect.isgeneratorfunction(function):
        return False
    else:
        raise RuntimeError(f"Function {function} is a strange type {type(function)}")


def get_function_type(is_generator: Optional[bool]) -> "api_pb2.Function.FunctionType.ValueType":
    return api_pb2.Function.FUNCTION_TYPE_GENERATOR if is_generator else api_pb2.Function.FUNCTION_TYPE_FUNCTION


class FunctionInfo:
    """Utility that determines serialization/deserialization mechanisms for functions

    * Stored as file vs serialized
    * If serialized: how to serialize the function
    * If file: which module/function name should be used to retrieve

    Used for populating the definition of a remote function
    """

    raw_f: Optional[Callable[..., Any]]  # if None - this is a "class service function"
    function_name: str
    implementation_name: str
    user_cls: Optional[type[Any]]
    module_name: Optional[str]

    _type: FunctionInfoType
    _file: Optional[str]
    _base_dir: str
    _remote_dir: Optional[PurePosixPath] = None

    def get_definition_type(self) -> "modal_proto.api_pb2.Function.DefinitionType.ValueType":
        if self.is_serialized():
            return modal_proto.api_pb2.Function.DEFINITION_TYPE_SERIALIZED
        else:
            return modal_proto.api_pb2.Function.DEFINITION_TYPE_FILE

    def is_service_class(self):
        if self.raw_f is None:
            assert self.user_cls
            return True
        return False

    # TODO: we should have a bunch of unit tests for this
    def __init__(
        self,
        f: Optional[Callable[..., Any]],
        serialized: bool = False,
        name_override: Optional[str] = None,
        user_cls: Optional[type] = None,
    ):
        self.raw_f = f
        self.user_cls = user_cls
        if f is None and user_cls:
            # "service function" for running all methods of a class
            self.implementation_name = f"{user_cls.__name__}.*"
        elif f and user_cls:
            # Method may be defined on superclass of the wrapped class
            self.implementation_name = f"{user_cls.__name__}.{f.__name__}"
        else:
            self.implementation_name = f.__qualname__

        self.function_name = name_override or self.implementation_name

        # If it's a cls, the @method could be defined in a base class in a different file.
        if user_cls is not None:
            module = inspect.getmodule(user_cls)
        else:
            module = inspect.getmodule(f)

        if getattr(module, "__package__", None) and not serialized:
            # This is a "real" module, eg. examples.logs.f
            # Get the package path
            # Note: __import__ always returns the top-level package.
            self._file = os.path.abspath(module.__file__)
            package_paths = {os.path.abspath(p) for p in __import__(module.__package__).__path__}
            # There might be multiple package paths in some weird cases
            base_dirs = [
                base_dir for base_dir in package_paths if os.path.commonpath((base_dir, self._file)) == base_dir
            ]

            if not base_dirs:
                logger.info(f"Module files: {self._file}")
                logger.info(f"Package paths: {package_paths}")
                logger.info(f"Base dirs: {base_dirs}")
                raise Exception("Wasn't able to find the package directory!")
            elif len(base_dirs) > 1:
                # Base_dirs should all be prefixes of each other since they all contain `module_file`.
                base_dirs.sort(key=len)
            self._base_dir = base_dirs[0]
            self.module_name = module.__spec__.name
            self._remote_dir = ROOT_DIR / PurePosixPath(module.__package__.split(".")[0])
            self._is_serialized = False
            self._type = FunctionInfoType.PACKAGE
        elif hasattr(module, "__file__") and not serialized:
            # This generally covers the case where it's invoked with
            # python foo/bar/baz.py

            # If it's a cls, the @method could be defined in a base class in a different file.
            self._file = os.path.abspath(inspect.getfile(module))
            self.module_name = inspect.getmodulename(self._file)
            self._base_dir = os.path.dirname(self._file)
            self._is_serialized = False
            self._type = FunctionInfoType.FILE
        else:
            self.module_name = None
            self._base_dir = os.path.abspath("")  # get current dir
            self._is_serialized = True  # either explicitly, or by being in a notebook
            if serialized:  # if explicit
                self._type = FunctionInfoType.SERIALIZED
            else:
                # notebook, or in general any exec() on a function definition
                self._type = FunctionInfoType.NOTEBOOK

        if not self.is_serialized():
            # Sanity check that this function is defined in global scope
            # Unfortunately, there's no "clean" way to do this in Python
            qualname = f.__qualname__ if f else user_cls.__qualname__
            if not is_global_object(qualname):
                raise LocalFunctionError(
                    "Modal can only import functions defined in global scope unless they are `serialized=True`"
                )

    def is_serialized(self) -> bool:
        return self._is_serialized

    def serialized_function(self) -> bytes:
        # Note: this should only be called from .load() and not at function decoration time
        #       otherwise the serialized function won't have access to variables/side effect
        #        defined after it in the same file
        assert self.is_serialized()
        if self.raw_f:
            serialized_bytes = serialize(self.raw_f)
            logger.debug(f"Serializing {self.raw_f.__qualname__}, size is {len(serialized_bytes)}")
            return serialized_bytes
        else:
            logger.debug(f"Serializing function for class service function {self.user_cls.__qualname__} as empty")
            return b""

    def get_cls_vars(self) -> dict[str, Any]:
        if self.user_cls is not None:
            cls_vars = {
                attr: getattr(self.user_cls, attr)
                for attr in dir(self.user_cls)
                if not callable(getattr(self.user_cls, attr)) and not attr.startswith("__")
            }
            return cls_vars
        return {}

    def get_cls_var_attrs(self) -> dict[str, Any]:
        import dis
        import opcode

        LOAD_ATTR = opcode.opmap["LOAD_ATTR"]
        STORE_ATTR = opcode.opmap["STORE_ATTR"]

        code = self.raw_f.__code__
        f_attr_ops = set()
        for instr in dis.get_instructions(code):
            if instr.opcode == LOAD_ATTR:
                f_attr_ops.add(instr.argval)
            elif instr.opcode == STORE_ATTR:
                f_attr_ops.add(instr.argval)

        cls_vars = self.get_cls_vars()
        f_attrs = {k: cls_vars[k] for k in cls_vars if k in f_attr_ops}
        return f_attrs

    def get_globals(self) -> dict[str, Any]:
        from .._vendor.cloudpickle import _extract_code_globals

        if self.raw_f is None:
            return {}

        func = self.raw_f
        while hasattr(func, "__wrapped__") and func is not func.__wrapped__:
            # Unwrap functions decorated using functools.wrapped (potentially multiple times)
            func = func.__wrapped__
        f_globals_ref = _extract_code_globals(func.__code__)
        f_globals = {k: func.__globals__[k] for k in f_globals_ref if k in func.__globals__}
        return f_globals

    def class_parameter_info(self) -> api_pb2.ClassParameterInfo:
        if not self.user_cls:
            return api_pb2.ClassParameterInfo()

        # TODO(elias): Resolve circular dependencies... maybe we'll need some cls_utils module
        from modal.cls import _get_class_constructor_signature, _use_annotation_parameters

        if not _use_annotation_parameters(self.user_cls):
            return api_pb2.ClassParameterInfo(format=api_pb2.ClassParameterInfo.PARAM_SERIALIZATION_FORMAT_PICKLE)

        # annotation parameters trigger strictly typed parametrization
        # which enables web endpoint for parametrized classes
        signature = _get_class_constructor_signature(self.user_cls)
        # at this point, the types in the signature should already have been validated (see Cls.from_local())
        parameter_specs = signature_to_parameter_specs(signature)

        return api_pb2.ClassParameterInfo(
            format=api_pb2.ClassParameterInfo.PARAM_SERIALIZATION_FORMAT_PROTO,
            schema=parameter_specs,
        )

    def get_entrypoint_mount(self) -> dict[str, _Mount]:
        """
        Includes:
        * Implicit mount of the function itself (the module or package that the function is part of)

        Does not include:
        * Client mount
        * Explicit mounts added to the stub or function declaration
        * "Auto mounted" mounts, i.e. all mounts in sys.modules that are *not* installed in site-packages.
            These are typically local modules which are imported but not part of the running package

        """
        if self.is_serialized():
            # Don't auto-mount anything for serialized functions (including notebooks)
            return {}

        # make sure the function's own entrypoint is included:
        if self._type == FunctionInfoType.PACKAGE:
            top_level_package = self.module_name.split(".")[0]
            # TODO: add deprecation warning if the following entrypoint mount
            #  includes non-.py files, since we'll want to migrate to .py-only
            #  soon to get it consistent with the `add_local_python_source()`
            #  defaults.
            return {top_level_package: _Mount._from_local_python_packages(top_level_package)}
        elif self._type == FunctionInfoType.FILE:
            # TODO: inspect if this file is already included as part of
            #  a package mount, and skip it + reference that package
            #  instead if that's the case. This avoids possible module
            #  duplication bugs
            module_file = Path(self._file)
            container_module_name = module_file.stem
            remote_path = ROOT_DIR / module_file.name
            if not _is_modal_path(remote_path):
                return {
                    container_module_name: _Mount._from_local_file(
                        self._file,
                        remote_path=remote_path,
                    )
                }
        return {}  # this should never be reached...

    def get_tag(self):
        return self.function_name

    def is_nullary(self):
        signature = inspect.signature(self.raw_f)
        for param in signature.parameters.values():
            if param.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
                # variadic parameters are nullary
                continue
            if param.default is param.empty:
                return False
        return True


def callable_has_non_self_params(f: Callable[..., Any]) -> bool:
    """Return True if a callable (function, bound method, or unbound method) has parameters other than self.

    Used to ensure that @exit(), @asgi_app, and @wsgi_app functions don't have parameters.
    """
    return any(param.name != "self" for param in inspect.signature(f).parameters.values())


def callable_has_non_self_non_default_params(f: Callable[..., Any]) -> bool:
    """Return True if a callable (function, bound method, or unbound method) has non-default parameters other than self.

    Used for deprecation of default parameters in @asgi_app and @wsgi_app functions.
    """
    for param in inspect.signature(f).parameters.values():
        if param.name == "self":
            continue

        if param.default != inspect.Parameter.empty:
            continue

        return True
    return False


async def _stream_function_call_data(
    client,
    stub,
    function_call_id: Optional[str],
    variant: Literal["data_in", "data_out"],
    attempt_token: Optional[str] = None,
) -> AsyncGenerator[Any, None]:
    """Read from the `data_in` or `data_out` stream of a function call."""
    if not function_call_id and not attempt_token:
        raise ValueError("function_call_id or attempt_token is required to read from a data stream")

    if stub is None:
        stub = client.stub

    last_index = 0

    # TODO(gongy): generalize this logic as util for unary streams
    retries_remaining = 10
    delay_ms = 1

    if variant == "data_in":
        stub_fn = stub.FunctionCallGetDataIn
    elif variant == "data_out":
        stub_fn = stub.FunctionCallGetDataOut
    else:
        raise ValueError(f"Invalid variant {variant}")

    while True:
        req = api_pb2.FunctionCallGetDataRequest(
            function_call_id=function_call_id,
            last_index=last_index,
        )
        if attempt_token:
            req.attempt_token = attempt_token  # oneof clears function_call_id.
        try:
            async for chunk in stub_fn.unary_stream(req):
                if chunk.index <= last_index:
                    continue
                if chunk.data_blob_id:
                    message_bytes = await blob_download(chunk.data_blob_id, client.stub)
                else:
                    message_bytes = chunk.data
                message = deserialize_data_format(message_bytes, chunk.data_format, client)

                last_index = chunk.index
                yield message
        except (ServiceError, InternalError, StreamTerminatedError) as exc:
            if retries_remaining > 0:
                retries_remaining -= 1
                if isinstance(exc, (ServiceError, InternalError)):
                    logger.debug(f"{variant} stream retrying with delay {delay_ms}ms due to {exc}")
                    await asyncio.sleep(delay_ms / 1000)
                    delay_ms = min(1000, delay_ms * 10)
                    continue
                elif isinstance(exc, StreamTerminatedError):
                    continue
            raise
        else:
            delay_ms = 1


OUTPUTS_TIMEOUT = 55.0  # seconds
ATTEMPT_TIMEOUT_GRACE_PERIOD = 5  # seconds


def exc_with_hints(exc: BaseException):
    """mdmd:hidden"""
    if isinstance(exc, ImportError) and exc.msg == "attempted relative import with no known parent package":
        exc.msg += """\n
HINT: For relative imports to work, you might need to run your modal app as a module. Try:
- `python -m my_pkg.my_app` instead of `python my_pkg/my_app.py`
- `modal deploy my_pkg.my_app` instead of `modal deploy my_pkg/my_app.py`
"""
    elif isinstance(
        exc, RuntimeError
    ) and "CUDA error: no kernel image is available for execution on the device" in str(exc):
        msg = (
            exc.args[0]
            + """\n
HINT: This error usually indicates an outdated CUDA version. Older versions of torch (<=1.12)
come with CUDA 10.2 by default. If pinning to an older torch version, you can specify a CUDA version
manually, for example:
-  image.pip_install("torch==1.12.1+cu116", find_links="https://download.pytorch.org/whl/torch_stable.html")
"""
        )
        exc.args = (msg,)

    return exc


async def _process_result(result: api_pb2.GenericResult, data_format: int, stub, client=None):
    if result.WhichOneof("data_oneof") == "data_blob_id":
        data = await blob_download(result.data_blob_id, stub)
    else:
        data = result.data

    if result.status == api_pb2.GenericResult.GENERIC_STATUS_TIMEOUT:
        raise FunctionTimeoutError(result.exception)
    elif result.status == api_pb2.GenericResult.GENERIC_STATUS_INTERNAL_FAILURE:
        raise InternalFailure(result.exception)
    elif result.status != api_pb2.GenericResult.GENERIC_STATUS_SUCCESS:
        if data and data_format in (api_pb2.DATA_FORMAT_PICKLE, api_pb2.DATA_FORMAT_UNSPECIFIED):
            # *Unspecified data format here but data present usually means that the exception
            # was created by the server representing an exception that occurred during container
            # startup (crash looping) that eventually got escalated to input failures.
            # TaskResult doesn't specify data format, so these results don't have that metadata
            # the moment.
            try:
                exc = deserialize(data, client)
            except DeserializationError as deser_exc:
                raise ExecutionError(
                    "Could not deserialize remote exception due to local error:\n"
                    + f"{deser_exc}\n"
                    + "This can happen if your local environment does not have the remote exception definitions.\n"
                    + "Here is the remote traceback:\n"
                    + f"{result.traceback}"
                ) from deser_exc.__cause__
            except Exception as deser_exc:
                raise ExecutionError(
                    "Could not deserialize remote exception due to local error:\n"
                    + f"{deser_exc}\n"
                    + "Here is the remote traceback:\n"
                    + f"{result.traceback}"
                ) from deser_exc
            if not isinstance(exc, BaseException):
                raise ExecutionError(f"Got remote exception of incorrect type {type(exc)}")

            if result.serialized_tb:
                try:
                    tb_dict = deserialize(result.serialized_tb, client)
                    line_cache = deserialize(result.tb_line_cache, client)
                    append_modal_tb(exc, tb_dict, line_cache)
                except Exception:
                    pass

            raise exc_with_hints(exc)

        raise RemoteError(result.exception)

    try:
        return deserialize_data_format(data, data_format, client)
    except ModuleNotFoundError as deser_exc:
        raise ExecutionError(
            "Could not deserialize result due to error:\n"
            f"{deser_exc}\n"
            "This can happen if your local environment does not have a module that was used to construct the result. \n"
        ) from deser_exc


def should_upload(
    num_bytes: int,
    max_object_size_bytes: int,
    function_call_invocation_type: Optional["api_pb2.FunctionCallInvocationType.ValueType"],
) -> bool:
    """
    Determine if the input should be uploaded to blob storage.
    """
    return num_bytes > max_object_size_bytes or (
        function_call_invocation_type == api_pb2.FUNCTION_CALL_INVOCATION_TYPE_ASYNC
        and num_bytes > MAX_ASYNC_OBJECT_SIZE_BYTES
    )


# This must be called against the client stub, not the input-plane stub.
async def _create_input(
    args,
    kwargs,
    stub: ModalClientModal,
    *,
    function: "modal._functions._Function",
    idx: Optional[int] = None,
    function_call_invocation_type: Optional["api_pb2.FunctionCallInvocationType.ValueType"] = None,
) -> api_pb2.FunctionPutInputsItem:
    """Serialize function arguments and create a FunctionInput protobuf,
    uploading to blob storage if needed.
    """
    method_name = function._use_method_name
    max_object_size_bytes = function._max_object_size_bytes

    if idx is None:
        idx = 0

    data_format = get_preferred_payload_format()
    if not function._metadata:
        raise ExecutionError("Attempted to call function that has not been hydrated with metadata")

    supported_input_formats = function._metadata.supported_input_formats or [api_pb2.DATA_FORMAT_PICKLE]
    if data_format not in supported_input_formats:
        data_format = supported_input_formats[0]

    args_serialized = _serialize_data_format((args, kwargs), data_format)

    if should_upload(len(args_serialized), max_object_size_bytes, function_call_invocation_type):
        args_blob_id, r2_failed, r2_throughput_bytes_s = await blob_upload_with_r2_failure_info(args_serialized, stub)
        return api_pb2.FunctionPutInputsItem(
            input=api_pb2.FunctionInput(
                args_blob_id=args_blob_id,
                data_format=data_format,
                method_name=method_name,
            ),
            idx=idx,
            r2_failed=r2_failed,
            r2_throughput_bytes_s=r2_throughput_bytes_s,
        )
    else:
        return api_pb2.FunctionPutInputsItem(
            input=api_pb2.FunctionInput(
                args=args_serialized,
                data_format=data_format,
                method_name=method_name,
            ),
            idx=idx,
        )


def _get_suffix_from_web_url_info(url_info: api_pb2.WebUrlInfo) -> str:
    if url_info.truncated:
        suffix = " [grey70](label truncated)[/grey70]"
    elif url_info.label_stolen:
        suffix = " [grey70](label stolen)[/grey70]"
    else:
        suffix = ""
    return suffix


class FunctionCreationStatus:
    # TODO(michael) this really belongs with other output-related code
    # but moving it here so we can use it when loading a function with output disabled
    tag: str
    response: Optional[api_pb2.FunctionCreateResponse] = None

    def __init__(self, resolver, tag):
        self.resolver = resolver
        self.tag = tag

    def __enter__(self):
        self.status_row = self.resolver.add_status_row()
        self.status_row.message(f"Creating function {self.tag}...")
        return self

    def set_response(self, resp: api_pb2.FunctionCreateResponse):
        self.response = resp

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            raise exc_val

        if not self.response:
            self.status_row.finish(f"Unknown error when creating function {self.tag}")

        elif web_url := self.response.handle_metadata.web_url:
            url_info = self.response.function.web_url_info
            requires_proxy_auth = self.response.function.webhook_config.requires_proxy_auth
            proxy_auth_suffix = " 🔑" if requires_proxy_auth else ""
            # Ensure terms used here match terms used in modal.com/docs/guide/webhook-urls doc.
            suffix = _get_suffix_from_web_url_info(url_info)
            # TODO: this is only printed when we're showing progress. Maybe move this somewhere else.
            for warning in self.response.server_warnings:
                self.status_row.warning(warning)
            self.status_row.finish(
                f"Created web function {self.tag} => [magenta underline]{web_url}[/magenta underline]"
                f"{proxy_auth_suffix}{suffix}"
            )

            # Print custom domain in terminal
            for custom_domain in self.response.function.custom_domain_info:
                custom_domain_status_row = self.resolver.add_status_row()
                custom_domain_status_row.finish(
                    f"Custom domain for {self.tag} => [magenta underline]{custom_domain.url}[/magenta underline]"
                )

        elif self.response.function.flash_service_urls:
            self.status_row.finish(f"Created function {self.tag}.")
            for flash_service_url in self.response.function.flash_service_urls:
                flash_service_url_status_row = self.resolver.add_status_row()
                flash_service_url_status_row.finish(
                    f"Created server endpoints for {self.tag} => "
                    f"[magenta underline]{flash_service_url}[/magenta underline]"
                )

        else:
            for warning in self.response.server_warnings:
                self.status_row.warning(warning)
            self.status_row.finish(f"Created function {self.tag}.")
            if self.response.function.method_definitions_set:
                for method_definition in self.response.function.method_definitions.values():
                    if method_definition.web_url:
                        url_info = method_definition.web_url_info
                        suffix = _get_suffix_from_web_url_info(url_info)
                        class_web_endpoint_method_status_row = self.resolver.add_status_row()
                        class_web_endpoint_method_status_row.finish(
                            f"Created web endpoint for {method_definition.function_name} => [magenta underline]"
                            f"{method_definition.web_url}[/magenta underline]{suffix}"
                        )
                        for custom_domain in method_definition.custom_domain_info:
                            custom_domain_status_row = self.resolver.add_status_row()
                            custom_domain_status_row.finish(
                                f"Custom domain for {method_definition.function_name} => [magenta underline]"
                                f"{custom_domain.url}[/magenta underline]"
                            )
