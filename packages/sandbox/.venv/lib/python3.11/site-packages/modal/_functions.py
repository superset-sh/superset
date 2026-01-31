# Copyright Modal Labs 2023
import asyncio
import dataclasses
import inspect
import textwrap
import time
import typing
import warnings
from collections.abc import AsyncGenerator, Collection, Sequence, Sized
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import TYPE_CHECKING, Any, AsyncIterator, Callable, Optional, Union

import typing_extensions
from google.protobuf.message import Message
from grpclib import Status
from synchronicity.combined_types import MethodWithAio

from modal_proto import api_pb2
from modal_proto.modal_api_grpc import ModalClientModal

from ._load_context import LoadContext
from ._object import _Object, live_method, live_method_gen
from ._pty import get_pty_info
from ._resolver import Resolver
from ._resources import convert_fn_config_to_resources_config
from ._runtime.execution_context import current_input_id, is_local
from ._serialization import (
    apply_defaults,
    get_callable_schema,
    serialize,
    serialize_proto_params,
    validate_parameter_values,
)
from ._traceback import print_server_warnings
from ._utils.async_utils import (
    TaskContext,
    aclosing,
    async_merge,
    callable_to_agen,
    deprecate_aio_usage,
    synchronizer,
    warn_if_generator_is_not_consumed,
)
from ._utils.blob_utils import MAX_OBJECT_SIZE_BYTES
from ._utils.deprecation import deprecation_warning, warn_if_passing_namespace
from ._utils.function_utils import (
    ATTEMPT_TIMEOUT_GRACE_PERIOD,
    OUTPUTS_TIMEOUT,
    FunctionCreationStatus,
    FunctionInfo,
    _create_input,
    _process_result,
    _stream_function_call_data,
    get_function_type,
    is_async,
)
from ._utils.grpc_utils import Retry, RetryWarningMessage
from ._utils.mount_utils import validate_network_file_systems, validate_volumes
from .call_graph import InputInfo, _reconstruct_call_graph
from .client import _Client
from .cloud_bucket_mount import _CloudBucketMount, cloud_bucket_mounts_to_proto
from .config import config
from .exception import (
    ExecutionError,
    InvalidError,
    NotFoundError,
    OutputExpiredError,
)
from .gpu import GPU_T, parse_gpu_config
from .image import _Image
from .mount import _get_client_mount, _Mount
from .network_file_system import _NetworkFileSystem, network_file_system_mount_protos
from .output import _get_output_manager
from .parallel_map import (
    _experimental_spawn_map_async,
    _experimental_spawn_map_sync,
    _for_each_async,
    _for_each_sync,
    _map_async,
    _map_invocation,
    _map_invocation_inputplane,
    _map_sync,
    _spawn_map_async,
    _spawn_map_invocation,
    _spawn_map_sync,
    _starmap_async,
    _starmap_sync,
    _SynchronizedQueue,
)
from .proxy import _Proxy
from .retries import Retries, RetryManager
from .schedule import Schedule
from .secret import _Secret
from .volume import _Volume

if TYPE_CHECKING:
    import modal.app
    import modal.cls
    import modal.functions

MAX_INTERNAL_FAILURE_COUNT = 8
TERMINAL_STATUSES = (
    api_pb2.GenericResult.GENERIC_STATUS_SUCCESS,
    api_pb2.GenericResult.GENERIC_STATUS_TERMINATED,
)


@dataclasses.dataclass
class _RetryContext:
    function_call_invocation_type: "api_pb2.FunctionCallInvocationType.ValueType"
    retry_policy: api_pb2.FunctionRetryPolicy
    function_call_jwt: str
    input_jwt: str
    input_id: str
    item: api_pb2.FunctionPutInputsItem
    sync_client_retries_enabled: bool


class _Invocation:
    """Internal client representation of a single-input call to a Modal Function or Generator"""

    stub: ModalClientModal

    def __init__(
        self,
        stub: ModalClientModal,
        function_call_id: str,
        client: _Client,
        retry_context: Optional[_RetryContext] = None,
    ):
        self.stub = stub
        self.client = client  # Used by the deserializer.
        self.function_call_id = function_call_id  # TODO: remove and use only input_id
        self._retry_context = retry_context

    @staticmethod
    async def create(
        function: "_Function",
        args,
        kwargs,
        *,
        client: _Client,
        function_call_invocation_type: "api_pb2.FunctionCallInvocationType.ValueType",
        from_spawn_map: bool = False,
    ) -> "_Invocation":
        assert client.stub
        stub = client.stub

        function_id = function.object_id
        item = await _create_input(
            args,
            kwargs,
            stub,
            function=function,
            function_call_invocation_type=function_call_invocation_type,
        )

        request = api_pb2.FunctionMapRequest(
            function_id=function_id,
            parent_input_id=current_input_id() or "",
            function_call_type=api_pb2.FUNCTION_CALL_TYPE_UNARY,
            pipelined_inputs=[item],
            function_call_invocation_type=function_call_invocation_type,
        )

        if from_spawn_map:
            request.from_spawn_map = True
            response = await client.stub.FunctionMap(
                request,
                retry=Retry(
                    max_retries=None,
                    max_delay=30.0,
                    warning_message=RetryWarningMessage(
                        message="Warning: `.spawn_map(...)` for function `{self._function_name}` is waiting to create"
                        "more function calls. This may be due to hitting rate limits or function backlog limits.",
                        warning_interval=10,
                        errors_to_warn_for=[Status.RESOURCE_EXHAUSTED],
                    ),
                    additional_status_codes=[Status.RESOURCE_EXHAUSTED],
                ),
            )
        else:
            response = await client.stub.FunctionMap(request)

        function_call_id = response.function_call_id
        if response.pipelined_inputs:
            assert len(response.pipelined_inputs) == 1
            input = response.pipelined_inputs[0]
            retry_context = _RetryContext(
                function_call_invocation_type=function_call_invocation_type,
                retry_policy=response.retry_policy,
                function_call_jwt=response.function_call_jwt,
                input_jwt=input.input_jwt,
                input_id=input.input_id,
                item=item,
                sync_client_retries_enabled=response.sync_client_retries_enabled,
            )
            return _Invocation(stub, function_call_id, client, retry_context)

        request_put = api_pb2.FunctionPutInputsRequest(
            function_id=function_id, inputs=[item], function_call_id=function_call_id
        )
        inputs_response: api_pb2.FunctionPutInputsResponse = await client.stub.FunctionPutInputs(request_put)
        processed_inputs = inputs_response.inputs
        if not processed_inputs:
            raise Exception("Could not create function call - the input queue seems to be full")
        input = inputs_response.inputs[0]
        retry_context = _RetryContext(
            function_call_invocation_type=function_call_invocation_type,
            retry_policy=response.retry_policy,
            function_call_jwt=response.function_call_jwt,
            input_jwt=input.input_jwt,
            input_id=input.input_id,
            item=item,
            sync_client_retries_enabled=response.sync_client_retries_enabled,
        )
        return _Invocation(stub, function_call_id, client, retry_context)

    async def pop_function_call_outputs(
        self,
        index: int = 0,
        timeout: Optional[float] = None,
        clear_on_success: bool = False,
        input_jwts: Optional[list[str]] = None,
    ) -> api_pb2.FunctionGetOutputsResponse:
        t0 = time.time()
        if timeout is None:
            backend_timeout = OUTPUTS_TIMEOUT
        else:
            # refresh backend call every 55s
            backend_timeout = min(OUTPUTS_TIMEOUT, timeout)

        while True:
            # always execute at least one poll for results, regardless if timeout is 0
            request = api_pb2.FunctionGetOutputsRequest(
                function_call_id=self.function_call_id,
                timeout=backend_timeout,
                last_entry_id="0-0",
                clear_on_success=clear_on_success,
                requested_at=time.time(),
                input_jwts=input_jwts,
                start_idx=index,
                end_idx=index,
            )
            response: api_pb2.FunctionGetOutputsResponse = await self.stub.FunctionGetOutputs(
                request,
                retry=Retry(attempt_timeout=backend_timeout + ATTEMPT_TIMEOUT_GRACE_PERIOD),
            )

            if len(response.outputs) > 0:
                return response

            if timeout is not None:
                # update timeout in retry loop
                backend_timeout = min(OUTPUTS_TIMEOUT, t0 + timeout - time.time())
                if backend_timeout < 0:
                    # return the last response to check for state of num_unfinished_inputs
                    return response

    async def _retry_input(self) -> None:
        ctx = self._retry_context
        if not ctx:
            raise ValueError("Cannot retry input when _retry_context is empty.")

        item = api_pb2.FunctionRetryInputsItem(input_jwt=ctx.input_jwt, input=ctx.item.input)
        request = api_pb2.FunctionRetryInputsRequest(function_call_jwt=ctx.function_call_jwt, inputs=[item])
        await self.stub.FunctionRetryInputs(request)

    async def _get_single_output(self, expected_jwt: Optional[str] = None) -> api_pb2.FunctionGetOutputsItem:
        # waits indefinitely for a single result for the function, and clear the outputs buffer after
        item: api_pb2.FunctionGetOutputsItem = (
            await self.pop_function_call_outputs(
                index=0,
                timeout=None,
                clear_on_success=True,
                input_jwts=[expected_jwt] if expected_jwt else None,
            )
        ).outputs[0]
        return item

    async def run_function(self) -> Any:
        # Use retry logic only if retry policy is specified and
        ctx = self._retry_context
        if (
            not ctx
            or not ctx.retry_policy
            or ctx.retry_policy.retries == 0
            or ctx.function_call_invocation_type != api_pb2.FUNCTION_CALL_INVOCATION_TYPE_SYNC
            or not ctx.sync_client_retries_enabled
        ):
            item = await self._get_single_output()
            return await _process_result(item.result, item.data_format, self.stub, self.client)

        # User errors including timeouts are managed by the user specified retry policy.
        user_retry_manager = RetryManager(ctx.retry_policy)

        while True:
            item = await self._get_single_output(ctx.input_jwt)
            if item.result.status in TERMINAL_STATUSES:
                return await _process_result(item.result, item.data_format, self.stub, self.client)

            if item.result.status != api_pb2.GenericResult.GENERIC_STATUS_INTERNAL_FAILURE:
                # non-internal failures get a delay before retrying
                delay_ms = user_retry_manager.get_delay_ms()
                if delay_ms is None:
                    # no more retries, this should raise an error when the non-success status is converted
                    # to an exception:
                    return await _process_result(item.result, item.data_format, self.stub, self.client)
                await asyncio.sleep(delay_ms / 1000)

            await self._retry_input()

    async def poll_function(self, timeout: Optional[float] = None, *, index: int = 0):
        """Waits up to timeout for a result from a function.

        If timeout is `None`, waits indefinitely. This function is not
        cancellation-safe.
        """
        response: api_pb2.FunctionGetOutputsResponse = await self.pop_function_call_outputs(
            index=index,
            timeout=timeout,
            clear_on_success=False,
        )
        if len(response.outputs) == 0 and response.num_unfinished_inputs == 0:
            # if no unfinished inputs and no outputs, then function expired
            raise OutputExpiredError()
        elif len(response.outputs) == 0:
            raise TimeoutError()

        return await _process_result(
            response.outputs[0].result, response.outputs[0].data_format, self.stub, self.client
        )

    async def run_generator(self):
        items_received = 0
        # populated when self.run_function() completes
        items_total: Union[int, None] = None
        async with aclosing(
            async_merge(
                _stream_function_call_data(self.client, None, self.function_call_id, variant="data_out"),
                callable_to_agen(self.run_function),
            )
        ) as streamer:
            async for item in streamer:
                if isinstance(item, api_pb2.GeneratorDone):
                    items_total = item.items_total
                else:
                    yield item
                    items_received += 1
                # The comparison avoids infinite loops if a non-deterministic generator is retried
                # and produces less data in the second run than what was already sent.
                if items_total is not None and items_received >= items_total:
                    break

    async def enumerate(self, start_index: int, end_index: int):
        """Iterate over the results of the function call in the range [start_index, end_index)."""
        limit = 49
        current_index = start_index
        while current_index < end_index:
            # batch_end_indx is inclusive, so we subtract 1 to get the last index in the batch.
            batch_end_index = min(current_index + limit, end_index) - 1
            request = api_pb2.FunctionGetOutputsRequest(
                function_call_id=self.function_call_id,
                timeout=0,
                last_entry_id="0-0",
                clear_on_success=False,
                requested_at=time.time(),
                start_idx=current_index,
                end_idx=batch_end_index,
            )
            response: api_pb2.FunctionGetOutputsResponse = await self.stub.FunctionGetOutputs(
                request, retry=Retry(attempt_timeout=ATTEMPT_TIMEOUT_GRACE_PERIOD)
            )

            outputs = list(response.outputs)
            outputs.sort(key=lambda x: x.idx)
            for output in outputs:
                if output.idx != current_index:
                    break
                result = await _process_result(output.result, output.data_format, self.stub, self.client)
                yield output.idx, result
                current_index += 1

            # We're missing current_index, so we need to poll the function for the next result
            if len(outputs) < (batch_end_index - current_index + 1):
                result = await self.poll_function(index=current_index)
                yield current_index, result
                current_index += 1


class _InputPlaneInvocation:
    """Internal client representation of a single-input call to a Modal Function using the input
    plane server API."""

    stub: ModalClientModal

    def __init__(
        self,
        stub: ModalClientModal,
        attempt_token: str,
        client: _Client,
        input_item: api_pb2.FunctionPutInputsItem,
        function_id: str,
        retry_policy: api_pb2.FunctionRetryPolicy,
        input_plane_region: str,
    ):
        self.stub = stub
        self.client = client  # Used by the deserializer.
        self.attempt_token = attempt_token
        self.input_item = input_item
        self.function_id = function_id
        self.retry_policy = retry_policy
        self.input_plane_region = input_plane_region

    @staticmethod
    async def create(
        function: "_Function",
        args,
        kwargs,
        *,
        client: _Client,
        input_plane_url: str,
        input_plane_region: str,
    ) -> "_InputPlaneInvocation":
        stub = await client.get_stub(input_plane_url)

        function_id = function.object_id
        control_plane_stub = client.stub
        # Note: Blob upload is done on the control plane stub, not the input plane stub!
        input_item = await _create_input(
            args,
            kwargs,
            control_plane_stub,
            function=function,
        )

        request = api_pb2.AttemptStartRequest(
            function_id=function_id,
            parent_input_id=current_input_id() or "",
            input=input_item,
        )

        metadata = await client.get_input_plane_metadata(input_plane_region)
        response = await stub.AttemptStart(request, metadata=metadata)
        attempt_token = response.attempt_token

        return _InputPlaneInvocation(
            stub, attempt_token, client, input_item, function_id, response.retry_policy, input_plane_region
        )

    async def run_function(self) -> Any:
        # User errors including timeouts are managed by the user-specified retry policy.
        user_retry_manager = RetryManager(self.retry_policy)

        # This will retry when the server returns GENERIC_STATUS_INTERNAL_FAILURE, i.e. lost inputs or worker preemption
        internal_failure_count = 0
        while True:
            await_request = api_pb2.AttemptAwaitRequest(
                attempt_token=self.attempt_token,
                timeout_secs=OUTPUTS_TIMEOUT,
                requested_at=time.time(),
            )
            metadata = await self.client.get_input_plane_metadata(self.input_plane_region)
            await_response: api_pb2.AttemptAwaitResponse = await self.stub.AttemptAwait(
                await_request,
                retry=Retry(attempt_timeout=OUTPUTS_TIMEOUT + ATTEMPT_TIMEOUT_GRACE_PERIOD),
                metadata=metadata,
            )

            # Keep awaiting until we get an output.
            if not await_response.HasField("output"):
                continue

            # If we have a final output, return.
            if await_response.output.result.status in TERMINAL_STATUSES:
                return await _process_result(
                    await_response.output.result, await_response.output.data_format, self.client.stub, self.client
                )

            # We have a failure (internal or application), so see if there are any retries left, and if so, retry.
            if await_response.output.result.status == api_pb2.GenericResult.GENERIC_STATUS_INTERNAL_FAILURE:
                internal_failure_count += 1
                # Limit the number of times we retry internal failures.
                if internal_failure_count < MAX_INTERNAL_FAILURE_COUNT:
                    # We immediately retry internal failures and the failure doesn't count towards the retry policy.
                    self.attempt_token = await self._retry_input(metadata)
                    continue
            elif (delay_ms := user_retry_manager.get_delay_ms()) is not None:
                # We still have user retries left, so sleep and retry.
                await asyncio.sleep(delay_ms / 1000)
                self.attempt_token = await self._retry_input(metadata)
                continue

            # No more retries left.
            return await _process_result(
                await_response.output.result, await_response.output.data_format, self.client.stub, self.client
            )

    async def _retry_input(self, metadata: list[tuple[str, str]]) -> str:
        retry_request = api_pb2.AttemptRetryRequest(
            function_id=self.function_id,
            parent_input_id=current_input_id() or "",
            input=self.input_item,
            attempt_token=self.attempt_token,
        )
        retry_response = await self.stub.AttemptRetry(retry_request, metadata=metadata)
        return retry_response.attempt_token

    async def run_generator(self):
        items_received = 0
        # populated when self.run_function() completes
        items_total: Union[int, None] = None
        async with aclosing(
            async_merge(
                _stream_function_call_data(
                    self.client,
                    self.stub,
                    function_call_id=None,
                    variant="data_out",
                    attempt_token=self.attempt_token,
                ),
                callable_to_agen(self.run_function),
            )
        ) as streamer:
            async for item in streamer:
                if isinstance(item, api_pb2.GeneratorDone):
                    items_total = item.items_total
                else:
                    yield item
                    items_received += 1
                # The comparison avoids infinite loops if a non-deterministic generator is retried
                # and produces less data in the second run than what was already sent.
                if items_total is not None and items_received >= items_total:
                    break

    @staticmethod
    async def _get_metadata(input_plane_region: str, client: _Client) -> list[tuple[str, str]]:
        if not input_plane_region:
            return []
        assert client._auth_token_manager, "Client is not open"
        token = await client._auth_token_manager.get_token()
        return [("x-modal-input-plane-region", input_plane_region), ("x-modal-auth-token", token)]


# Wrapper type for api_pb2.FunctionStats
@dataclass(frozen=True)
class FunctionStats:
    """Simple data structure storing stats for a running function."""

    backlog: int
    num_total_runners: int


def _parse_retries(
    retries: Optional[Union[int, Retries]],
    source: str = "",
) -> Optional[api_pb2.FunctionRetryPolicy]:
    if isinstance(retries, int):
        return Retries(
            max_retries=retries,
            initial_delay=1.0,
            backoff_coefficient=1.0,
        )._to_proto()
    elif isinstance(retries, Retries):
        return retries._to_proto()
    elif retries is None:
        return None
    else:
        extra = f" on {source}" if source else ""
        msg = f"Retries parameter must be an integer or instance of modal.Retries. Found: {type(retries)}{extra}."
        raise InvalidError(msg)


@dataclass
class _FunctionSpec:
    """
    Stores information about a Function specification.
    This is used for `modal shell` to support running shells with
    the same configuration as a user-defined Function.
    """

    image: Optional[_Image]
    mounts: Sequence[_Mount]
    secrets: Collection[_Secret]
    network_file_systems: dict[Union[str, PurePosixPath], _NetworkFileSystem]
    volumes: dict[Union[str, PurePosixPath], Union[_Volume, _CloudBucketMount]]
    # TODO(irfansharif): Somehow assert that it's the first kind, in sandboxes
    gpus: Union[GPU_T, list[GPU_T]]
    cloud: Optional[str]
    cpu: Optional[Union[float, tuple[float, float]]]
    memory: Optional[Union[int, tuple[int, int]]]
    ephemeral_disk: Optional[int]
    scheduler_placement: Optional[api_pb2.SchedulerPlacement]
    proxy: Optional[_Proxy]


def _get_supported_input_output_formats(is_web_endpoint: bool, is_generator: bool, restrict_output: bool):
    if is_web_endpoint:
        supported_input_formats = [api_pb2.DATA_FORMAT_ASGI]
        supported_output_formats = [api_pb2.DATA_FORMAT_ASGI, api_pb2.DATA_FORMAT_GENERATOR_DONE]
    else:
        supported_input_formats = [api_pb2.DATA_FORMAT_PICKLE, api_pb2.DATA_FORMAT_CBOR]
        if restrict_output:
            supported_output_formats = [api_pb2.DATA_FORMAT_CBOR]
        else:
            supported_output_formats = [api_pb2.DATA_FORMAT_PICKLE, api_pb2.DATA_FORMAT_CBOR]
        if is_generator:
            supported_output_formats.append(api_pb2.DATA_FORMAT_GENERATOR_DONE)
    return supported_input_formats, supported_output_formats


P = typing_extensions.ParamSpec("P")
ReturnType = typing.TypeVar("ReturnType", covariant=True)
OriginalReturnType = typing.TypeVar(
    "OriginalReturnType", covariant=True
)  # differs from return type if ReturnType is coroutine
T = typing.TypeVar("T", covariant=True)


class _Function(typing.Generic[P, ReturnType, OriginalReturnType], _Object, type_prefix="fu"):
    """Functions are the basic units of serverless execution on Modal.

    Generally, you will not construct a `Function` directly. Instead, use the
    `App.function()` decorator to register your Python functions with your App.
    """

    # TODO: more type annotations
    _info: Optional[FunctionInfo]
    _serve_mounts: frozenset[_Mount]  # set at load time, only by loader
    _app: Optional["modal.app._App"] = None
    # only set for InstanceServiceFunctions and bound instance methods
    _obj: Optional["modal.cls._Obj"] = None

    # this is set in definition scope, only locally
    _webhook_config: Optional[api_pb2.WebhookConfig] = None
    _web_url: Optional[str]  # this is set on hydration

    _function_name: Optional[str]
    _is_method: bool
    _spec: Optional[_FunctionSpec] = None
    _tag: str
    # this is set to None for a "class service [function]"
    _raw_f: Optional[Callable[..., Any]]
    _build_args: dict

    _is_generator: Optional[bool] = None

    # when this is the method of a class/object function, invocation of this function
    # should supply the method name in the FunctionInput:
    _use_method_name: str = ""

    _class_parameter_info: Optional["api_pb2.ClassParameterInfo"] = None
    _method_handle_metadata: Optional[dict[str, "api_pb2.FunctionHandleMetadata"]] = (
        None  # set for 0.67+ class service functions
    )
    _metadata: Optional[api_pb2.FunctionHandleMetadata] = None

    @staticmethod
    def from_local(
        info: FunctionInfo,
        app: Optional["modal.app._App"],  # App here should only be None in case of Image.run_function
        image: _Image,
        env: Optional[dict[str, Optional[str]]] = None,
        secrets: Optional[Collection[_Secret]] = None,
        schedule: Optional[Schedule] = None,
        is_generator: bool = False,
        gpu: Union[GPU_T, list[GPU_T]] = None,
        # TODO: maybe break this out into a separate decorator for notebooks.
        network_file_systems: dict[Union[str, PurePosixPath], _NetworkFileSystem] = {},
        volumes: dict[Union[str, PurePosixPath], Union[_Volume, _CloudBucketMount]] = {},
        webhook_config: Optional[api_pb2.WebhookConfig] = None,
        cpu: Optional[Union[float, tuple[float, float]]] = None,
        memory: Optional[Union[int, tuple[int, int]]] = None,
        proxy: Optional[_Proxy] = None,
        retries: Optional[Union[int, Retries]] = None,
        timeout: int = 300,
        startup_timeout: Optional[int] = None,
        min_containers: Optional[int] = None,
        max_containers: Optional[int] = None,
        buffer_containers: Optional[int] = None,
        scaledown_window: Optional[int] = None,
        max_concurrent_inputs: Optional[int] = None,
        target_concurrent_inputs: Optional[int] = None,
        batch_max_size: Optional[int] = None,
        batch_wait_ms: Optional[int] = None,
        cloud: Optional[str] = None,
        region: Optional[Union[str, Sequence[str]]] = None,
        nonpreemptible: bool = False,
        is_builder_function: bool = False,
        is_auto_snapshot: bool = False,
        is_server: bool = False,
        enable_memory_snapshot: bool = False,
        block_network: bool = False,
        restrict_modal_access: bool = False,
        i6pn_enabled: bool = False,
        # Experimental: Clustered functions
        cluster_size: Optional[int] = None,
        rdma: Optional[bool] = None,
        single_use_containers: bool = False,
        ephemeral_disk: Optional[int] = None,
        include_source: bool = True,
        experimental_options: Optional[dict[str, str]] = None,
        _experimental_proxy_ip: Optional[str] = None,
        _experimental_custom_scaling_factor: Optional[float] = None,
        restrict_output: bool = False,
        http_config: Optional[api_pb2.HTTPConfig] = None,
    ) -> "_Function":
        """mdmd:hidden

        Note: This is not intended to be public API.
        """
        # Needed to avoid circular imports
        from ._partial_function import _find_partial_methods_for_user_cls, _PartialFunctionFlags

        tag = info.get_tag()

        if info.raw_f:
            raw_f = info.raw_f
            assert callable(raw_f)
            if schedule is not None and not info.is_nullary():
                raise InvalidError(
                    f"Function {raw_f} has a schedule, so it needs to support being called with no arguments"
                )
        else:
            assert info.user_cls
            assert not webhook_config
            assert not schedule

        entrypoint_mount = info.get_entrypoint_mount() if include_source else {}
        all_mounts = [
            _get_client_mount(),
            *entrypoint_mount.values(),
        ]

        retry_policy = _parse_retries(
            retries,
            f"Function '{info.get_tag()}'" if info.raw_f else f"Class '{info.get_tag()}'",
        )

        if retry_policy is not None:
            if webhook_config is not None:
                raise InvalidError("Web endpoints do not support retries.")
            if is_generator:
                raise InvalidError("Generator functions do not support retries.")

        if timeout is None:  # type: ignore[unreachable]  # Help users who aren't using type checkers
            raise InvalidError("The `timeout` parameter cannot be set to None: https://modal.com/docs/guide/timeouts")

        secrets = secrets or []
        if env:
            secrets = [*secrets, _Secret.from_dict(env)]

        scheduler_placement: Optional[api_pb2.SchedulerPlacement] = None
        if region or nonpreemptible:
            regions = [region] if isinstance(region, str) else (list(region) if region else None)
            scheduler_placement = api_pb2.SchedulerPlacement(regions=regions, nonpreemptible=nonpreemptible)

        function_spec = _FunctionSpec(
            mounts=all_mounts,
            secrets=secrets,
            gpus=gpu,
            network_file_systems=network_file_systems,
            volumes=volumes,
            image=image,
            cloud=cloud,
            cpu=cpu,
            memory=memory,
            ephemeral_disk=ephemeral_disk,
            scheduler_placement=scheduler_placement,
            proxy=proxy,
        )

        # Note that we also do these checks in FunctionCreate; could drop them here
        if min_containers is not None and not isinstance(min_containers, int):
            raise InvalidError(f"`min_containers` must be an int, not {type(min_containers).__name__}")
        if min_containers is not None and max_containers is not None and max_containers < min_containers:
            raise InvalidError(
                f"`min_containers` ({min_containers}) cannot be greater than `max_containers` ({max_containers})"
            )
        if scaledown_window is not None and scaledown_window <= 0:
            raise InvalidError("`scaledown_window` must be > 0")

        autoscaler_settings = api_pb2.AutoscalerSettings(
            min_containers=min_containers,
            max_containers=max_containers,
            buffer_containers=buffer_containers,
            scaledown_window=scaledown_window,
        )

        # For clustered functions, container settings must be multiples of cluster_size
        if cluster_size is not None and cluster_size > 1:
            for field in ["min_containers", "max_containers", "buffer_containers"]:
                value = getattr(autoscaler_settings, field)
                if value and value % cluster_size != 0:
                    raise InvalidError(
                        f"`{field}` ({value}) must be a multiple of `cluster_size` ({cluster_size}) "
                        f"for clustered Functions"
                    )

        if _experimental_custom_scaling_factor is not None and (
            _experimental_custom_scaling_factor < 0 or _experimental_custom_scaling_factor > 1
        ):
            raise InvalidError("`_experimental_custom_scaling_factor` must be between 0.0 and 1.0 inclusive.")

        if not cloud and not is_builder_function:
            cloud = config.get("default_cloud")

        if is_generator and webhook_config:
            if webhook_config.type == api_pb2.WEBHOOK_TYPE_FUNCTION:
                raise InvalidError(
                    """Webhooks cannot be generators. If you want a streaming response, see https://modal.com/docs/guide/streaming-endpoints
                    """
                )
            else:
                raise InvalidError("Webhooks cannot be generators")

        if info.raw_f and batch_max_size:
            func_name = info.raw_f.__name__
            if is_generator:
                raise InvalidError(f"Modal batched function {func_name} cannot return generators")
            for arg in inspect.signature(info.raw_f).parameters.values():
                if arg.default is not inspect.Parameter.empty:
                    raise InvalidError(f"Modal batched function {func_name} does not accept default arguments.")

        # Validate volumes
        validated_volumes = validate_volumes(volumes)
        cloud_bucket_mounts = [(k, v) for k, v in validated_volumes if isinstance(v, _CloudBucketMount)]
        validated_volumes_no_cloud_buckets = [(k, v) for k, v in validated_volumes if isinstance(v, _Volume)]

        # Validate NFS
        validated_network_file_systems = validate_network_file_systems(network_file_systems)

        # Validate image
        if image is not None and not isinstance(image, _Image):  # type: ignore[unreachable]
            raise InvalidError(f"Expected modal.Image object. Got {type(image)}.")

        method_definitions: Optional[dict[str, api_pb2.MethodDefinition]] = None

        if info.user_cls:
            method_definitions = {}
            interface_methods = _find_partial_methods_for_user_cls(
                info.user_cls, _PartialFunctionFlags.interface_flags()
            )
            for method_name, partial_function in interface_methods.items():
                function_type = get_function_type(partial_function.params.is_generator)
                function_name = f"{info.user_cls.__name__}.{method_name}"
                is_web_endpoint = partial_function._is_web_endpoint()
                method_schema = get_callable_schema(
                    partial_function._get_raw_f(),
                    is_web_endpoint=is_web_endpoint,
                    ignore_first_argument=True,
                )
                method_input_formats, method_output_formats = _get_supported_input_output_formats(
                    is_web_endpoint, partial_function.params.is_generator or False, restrict_output
                )

                method_definition = api_pb2.MethodDefinition(
                    webhook_config=partial_function.params.webhook_config,
                    function_type=function_type,
                    function_name=function_name,
                    function_schema=method_schema,
                    supported_input_formats=method_input_formats,
                    supported_output_formats=method_output_formats,
                )
                method_definitions[method_name] = method_definition

        function_type = get_function_type(is_generator)

        def _deps(only_explicit_mounts=False) -> list[_Object]:
            deps: list[_Object] = list(secrets)
            if not only_explicit_mounts:
                deps += list(all_mounts)
            if proxy:
                deps.append(proxy)
            if image:
                deps.append(image)
            for _, nfs in validated_network_file_systems:
                deps.append(nfs)
            for _, vol in validated_volumes_no_cloud_buckets:
                deps.append(vol)
            for _, cloud_bucket_mount in cloud_bucket_mounts:
                if cloud_bucket_mount.secret:
                    deps.append(cloud_bucket_mount.secret)

            return deps

        if info.is_service_class():
            # classes don't have data formats themselves - input/output formats are set per method above
            supported_input_formats = []
            supported_output_formats = []
        else:
            is_web_endpoint = webhook_config is not None and webhook_config.type != api_pb2.WEBHOOK_TYPE_UNSPECIFIED
            supported_input_formats, supported_output_formats = _get_supported_input_output_formats(
                is_web_endpoint, is_generator, restrict_output
            )

        async def _preload(
            self: _Function, resolver: Resolver, load_context: LoadContext, existing_object_id: Optional[str]
        ):
            assert load_context.app_id
            req = api_pb2.FunctionPrecreateRequest(
                app_id=load_context.app_id,
                function_name=info.function_name,
                function_type=function_type,
                existing_function_id=existing_object_id or "",
                function_schema=get_callable_schema(info.raw_f, is_web_endpoint=bool(webhook_config))
                if info.raw_f
                else None,
                supported_input_formats=supported_input_formats,
                supported_output_formats=supported_output_formats,
            )
            if method_definitions:
                for method_name, method_definition in method_definitions.items():
                    req.method_definitions[method_name].CopyFrom(method_definition)
            elif webhook_config:
                req.webhook_config.CopyFrom(webhook_config)

            response = await load_context.client.stub.FunctionPrecreate(req)
            self._hydrate(response.function_id, load_context.client, response.handle_metadata)

        async def _load(
            self: _Function, resolver: Resolver, load_context: LoadContext, existing_object_id: Optional[str]
        ):
            with FunctionCreationStatus(resolver, tag) as function_creation_status:
                timeout_secs = timeout

                if app and app.is_interactive and not is_builder_function:
                    pty_info = get_pty_info(shell=False)
                else:
                    pty_info = None

                if info.is_serialized():
                    # Use cloudpickle. Used when working w/ Jupyter notebooks.
                    # serialize at _load time, not function decoration time
                    # otherwise we can't capture a surrounding class for lifetime methods etc.
                    function_serialized = info.serialized_function()
                    class_serialized = serialize(info.user_cls) if info.user_cls is not None else None
                    # Ensure that large data in global variables does not blow up the gRPC payload,
                    # which has maximum size 100 MiB. We set the limit lower for performance reasons.
                    if len(function_serialized) > 16 << 20:  # 16 MiB
                        raise InvalidError(
                            f"Function {info.raw_f} has size {len(function_serialized)} bytes when packaged. "
                            "This is larger than the maximum limit of 16 MiB. "
                            "Try reducing the size of the closure by using parameters or mounts, "
                            "not large global variables."
                        )
                    elif len(function_serialized) > 256 << 10:  # 256 KiB
                        warnings.warn(
                            f"Function {info.raw_f} has size {len(function_serialized)} bytes when packaged. "
                            "This is larger than the recommended limit of 256 KiB. "
                            "Try reducing the size of the closure by using parameters or mounts, "
                            "not large global variables."
                        )
                else:
                    function_serialized = None
                    class_serialized = None

                app_name = ""
                if app and app.name:
                    app_name = app.name

                # on builder > 2024.10 we mount client dependencies at runtime
                mount_client_dependencies = False
                if image._metadata is not None:
                    mount_client_dependencies = image._metadata.image_builder_version > "2024.10"

                # Relies on dicts being ordered (true as of Python 3.6).
                volume_mounts = [
                    api_pb2.VolumeMount(
                        mount_path=path,
                        volume_id=volume.object_id,
                        allow_background_commits=True,
                        read_only=volume._read_only,
                    )
                    for path, volume in validated_volumes_no_cloud_buckets
                ]
                loaded_mount_ids = {m.object_id for m in all_mounts} | {m.object_id for m in image._mount_layers}

                # Get object dependencies
                object_dependencies = []
                for dep in _deps(only_explicit_mounts=True):
                    if not dep.object_id:
                        raise Exception(f"Dependency {dep} isn't hydrated")
                    object_dependencies.append(api_pb2.ObjectDependency(object_id=dep.object_id))

                function_data: Optional[api_pb2.FunctionData] = None
                function_schema = (
                    get_callable_schema(info.raw_f, is_web_endpoint=bool(webhook_config)) if info.raw_f else None
                )

                # Create function remotely
                function_definition = api_pb2.Function(
                    module_name=info.module_name or "",
                    function_name=info.function_name,
                    implementation_name=info.implementation_name,
                    mount_ids=loaded_mount_ids,
                    secret_ids=[secret.object_id for secret in secrets],
                    image_id=(image.object_id if image else ""),
                    definition_type=info.get_definition_type(),
                    function_serialized=function_serialized or b"",
                    class_serialized=class_serialized or b"",
                    function_type=function_type,
                    webhook_config=webhook_config,
                    autoscaler_settings=autoscaler_settings,
                    method_definitions=method_definitions,
                    method_definitions_set=True,
                    shared_volume_mounts=network_file_system_mount_protos(validated_network_file_systems),
                    volume_mounts=volume_mounts,
                    proxy_id=(proxy.object_id if proxy else None),
                    retry_policy=retry_policy,
                    timeout_secs=timeout_secs or 0,
                    startup_timeout_secs=startup_timeout or timeout_secs,
                    pty_info=pty_info,
                    cloud_provider_str=cloud if cloud else "",
                    runtime=config.get("function_runtime"),
                    runtime_debug=config.get("function_runtime_debug"),
                    runtime_perf_record=config.get("runtime_perf_record"),
                    app_name=app_name,
                    is_builder_function=is_builder_function,
                    max_concurrent_inputs=max_concurrent_inputs or 0,
                    target_concurrent_inputs=target_concurrent_inputs or 0,
                    batch_max_size=batch_max_size or 0,
                    batch_linger_ms=batch_wait_ms or 0,
                    worker_id=config.get("worker_id"),
                    is_auto_snapshot=is_auto_snapshot,
                    is_method=bool(info.user_cls) and not info.is_service_class(),
                    checkpointing_enabled=enable_memory_snapshot,
                    object_dependencies=object_dependencies,
                    block_network=block_network,
                    untrusted=restrict_modal_access,
                    single_use_containers=single_use_containers,
                    max_inputs=int(single_use_containers),  # TODO(michael) remove after worker rollover
                    cloud_bucket_mounts=cloud_bucket_mounts_to_proto(cloud_bucket_mounts),
                    scheduler_placement=scheduler_placement,
                    is_class=info.is_service_class(),
                    class_parameter_info=info.class_parameter_info(),
                    i6pn_enabled=i6pn_enabled,
                    schedule=schedule.proto_message if schedule is not None else None,
                    snapshot_debug=config.get("snapshot_debug"),
                    experimental_options=experimental_options or {},
                    mount_client_dependencies=mount_client_dependencies,
                    # ---
                    _experimental_group_size=cluster_size or 0,  # Experimental: Clustered functions
                    _experimental_concurrent_cancellations=True,
                    _experimental_proxy_ip=_experimental_proxy_ip,
                    _experimental_custom_scaling=_experimental_custom_scaling_factor is not None,
                    # --- These are deprecated in favor of autoscaler_settings
                    warm_pool_size=min_containers or 0,
                    concurrency_limit=max_containers or 0,
                    _experimental_buffer_containers=buffer_containers or 0,
                    task_idle_timeout_secs=scaledown_window or 0,
                    # ---
                    function_schema=function_schema,
                    supported_input_formats=supported_input_formats,
                    supported_output_formats=supported_output_formats,
                    http_config=http_config,
                    is_server=is_server,
                )

                if isinstance(gpu, list):
                    function_data = api_pb2.FunctionData(
                        module_name=function_definition.module_name,
                        function_name=function_definition.function_name,
                        implementation_name=function_definition.implementation_name,
                        function_type=function_definition.function_type,
                        warm_pool_size=function_definition.warm_pool_size,
                        concurrency_limit=function_definition.concurrency_limit,
                        task_idle_timeout_secs=function_definition.task_idle_timeout_secs,
                        autoscaler_settings=function_definition.autoscaler_settings,
                        worker_id=function_definition.worker_id,
                        timeout_secs=function_definition.timeout_secs,
                        startup_timeout_secs=function_definition.startup_timeout_secs,
                        web_url=function_definition.web_url,
                        web_url_info=function_definition.web_url_info,
                        webhook_config=function_definition.webhook_config,
                        custom_domain_info=function_definition.custom_domain_info,
                        schedule=schedule.proto_message if schedule is not None else None,
                        is_class=function_definition.is_class,
                        class_parameter_info=function_definition.class_parameter_info,
                        is_method=function_definition.is_method,
                        use_function_id=function_definition.use_function_id,
                        use_method_name=function_definition.use_method_name,
                        method_definitions=function_definition.method_definitions,
                        method_definitions_set=function_definition.method_definitions_set,
                        experimental_options=experimental_options or {},
                        _experimental_group_size=function_definition._experimental_group_size,
                        _experimental_buffer_containers=function_definition._experimental_buffer_containers,
                        _experimental_custom_scaling=function_definition._experimental_custom_scaling,
                        _experimental_proxy_ip=function_definition._experimental_proxy_ip,
                        snapshot_debug=function_definition.snapshot_debug,
                        runtime_perf_record=function_definition.runtime_perf_record,
                        function_schema=function_schema,
                        untrusted=function_definition.untrusted,
                        supported_input_formats=supported_input_formats,
                        supported_output_formats=supported_output_formats,
                        http_config=http_config,
                        is_server=function_definition.is_server,
                    )

                    ranked_functions = []
                    for rank, _gpu in enumerate(gpu):
                        function_definition_copy = api_pb2.Function()
                        function_definition_copy.CopyFrom(function_definition)

                        function_definition_copy.resources.CopyFrom(
                            convert_fn_config_to_resources_config(
                                cpu=cpu, memory=memory, gpu=_gpu, ephemeral_disk=ephemeral_disk, rdma=rdma
                            ),
                        )
                        ranked_function = api_pb2.FunctionData.RankedFunction(
                            rank=rank,
                            function=function_definition_copy,
                        )
                        ranked_functions.append(ranked_function)
                    function_data.ranked_functions.extend(ranked_functions)
                    function_definition = None  # function_definition is not used in this case
                else:
                    # TODO(irfansharif): Assert on this specific type once we get rid of python 3.9.
                    # assert isinstance(gpu, GPU_T)  # includes the case where gpu==None case
                    function_definition.resources.CopyFrom(
                        convert_fn_config_to_resources_config(
                            cpu=cpu, memory=memory, gpu=gpu, ephemeral_disk=ephemeral_disk, rdma=rdma
                        ),
                    )

                assert load_context.app_id
                assert (function_definition is None) != (function_data is None)  # xor
                request = api_pb2.FunctionCreateRequest(
                    app_id=load_context.app_id,
                    function=function_definition,
                    function_data=function_data,
                    existing_function_id=existing_object_id or "",
                )
                try:
                    response: api_pb2.FunctionCreateResponse = await load_context.client.stub.FunctionCreate(request)
                except Exception as exc:
                    if "Received :status = '413'" in str(exc):
                        raise InvalidError(f"Function {info.function_name} is too large to deploy.")
                    raise
                function_creation_status.set_response(response)

            # needed for modal.serve file watching
            serve_mounts = {m for m in all_mounts if m.is_local()}
            serve_mounts |= image._serve_mounts
            obj._serve_mounts = frozenset(serve_mounts)
            self._hydrate(response.function_id, load_context.client, response.handle_metadata)

        rep = f"Function({tag})"
        # Pass a *reference* to the App's LoadContext - this is important since the App is
        # the only way to infer a LoadContext for an `@app.function`, and the App doesn't
        # get its client until *after* the Function is created.
        load_context = app._root_load_context if app else LoadContext.empty()
        obj = _Function._from_loader(_load, rep, preload=_preload, deps=_deps, load_context_overrides=load_context)

        obj._raw_f = info.raw_f
        obj._info = info
        obj._tag = tag
        obj._app = app  # needed for CLI right now
        obj._obj = None
        obj._is_generator = is_generator
        obj._is_method = False
        obj._spec = function_spec  # needed for modal shell
        obj._webhook_config = webhook_config  # only set locally

        # Used to check whether we should rebuild a modal.Image which uses `run_function`.
        gpus: list[GPU_T] = gpu if isinstance(gpu, list) else [gpu]
        obj._build_args = dict(  # See get_build_def
            secrets=repr(secrets),
            gpu_config=repr([parse_gpu_config(_gpu) for _gpu in gpus]),
            network_file_systems=repr(network_file_systems),
        )
        # these key are excluded if empty to avoid rebuilds on client upgrade
        if volumes:
            obj._build_args["volumes"] = repr(volumes)
        if cloud or scheduler_placement:
            obj._build_args["cloud"] = repr(cloud)
            obj._build_args["scheduler_placement"] = repr(scheduler_placement)

        return obj

    def _bind_parameters(
        self,
        obj: "modal.cls._Obj",
        options: Optional["modal.cls._ServiceOptions"],
        args: Sized,
        kwargs: dict[str, Any],
    ) -> "_Function":
        """mdmd:hidden

        Binds a class-function to a specific instance of (init params, options) or a new workspace
        """

        parent = self

        async def _load(
            param_bound_func: _Function,
            resolver: Resolver,
            load_context: LoadContext,
            existing_object_id: Optional[str],
        ):
            if not parent.is_hydrated:
                # While the base Object.hydrate() method appears to be idempotent, it's not always safe
                await parent.hydrate()

            assert parent._client and parent._client.stub

            if (
                parent._class_parameter_info
                and parent._class_parameter_info.format == api_pb2.ClassParameterInfo.PARAM_SERIALIZATION_FORMAT_PROTO
            ):
                if args:
                    # TODO(elias) - We could potentially support positional args as well, if we want to?
                    raise InvalidError(
                        "Can't use positional arguments with modal.parameter-based synthetic constructors.\n"
                        "Use (<parameter_name>=value) keyword arguments when constructing classes instead."
                    )
                schema = parent._class_parameter_info.schema
                kwargs_with_defaults = apply_defaults(kwargs, schema)
                validate_parameter_values(kwargs_with_defaults, schema)
                serialized_params = serialize_proto_params(kwargs_with_defaults)
                can_use_parent = len(parent._class_parameter_info.schema) == 0  # no parameters
            else:
                from modal.cls import _ServiceOptions  # Should probably define this dataclass here?

                can_use_parent = len(args) + len(kwargs) == 0 and (options == _ServiceOptions())
                serialized_params = serialize((args, kwargs))

            if can_use_parent:
                # We can end up here if parent wasn't hydrated when class was instantiated, but has been since.
                param_bound_func._hydrate_from_other(parent)
                return

            assert parent is not None and parent.is_hydrated

            if options:
                volume_mounts = [
                    api_pb2.VolumeMount(
                        mount_path=path,
                        volume_id=volume.object_id,
                        allow_background_commits=True,
                        read_only=volume._read_only,
                    )
                    for path, volume in options.validated_volumes
                ]
                options_pb = api_pb2.FunctionOptions(
                    secret_ids=[s.object_id for s in options.secrets],
                    replace_secret_ids=bool(options.secrets),
                    replace_volume_mounts=len(volume_mounts) > 0,
                    volume_mounts=volume_mounts,
                    cloud_bucket_mounts=cloud_bucket_mounts_to_proto(options.cloud_bucket_mounts),
                    replace_cloud_bucket_mounts=bool(options.cloud_bucket_mounts),
                    resources=options.resources,
                    retry_policy=options.retry_policy,
                    concurrency_limit=options.max_containers,
                    buffer_containers=options.buffer_containers,
                    task_idle_timeout_secs=options.scaledown_window,
                    timeout_secs=options.timeout_secs,
                    max_concurrent_inputs=options.max_concurrent_inputs,
                    target_concurrent_inputs=options.target_concurrent_inputs,
                    batch_max_size=options.batch_max_size,
                    batch_linger_ms=options.batch_wait_ms,
                    scheduler_placement=options.scheduler_placement,
                    cloud_provider_str=options.cloud,
                )
            else:
                options_pb = None

            req = api_pb2.FunctionBindParamsRequest(
                function_id=parent.object_id,
                serialized_params=serialized_params,
                function_options=options_pb,
                environment_name=load_context.environment_name
                or "",  # TODO: investigate shouldn't environment name always be specified here?
            )

            response = await parent._client.stub.FunctionBindParams(req)
            param_bound_func._hydrate(response.bound_function_id, parent._client, response.handle_metadata)

        def _deps():
            if options:
                all_deps = (
                    [v for _, v in options.validated_volumes]
                    + list(options.secrets)
                    + [mount.secret for _, mount in options.cloud_bucket_mounts if mount.secret]
                )
                return [dep for dep in all_deps if not dep.is_hydrated]
            return []

        fun: _Function = _Function._from_loader(
            _load,
            "Function(parametrized)",
            hydrate_lazily=True,
            deps=_deps,
            load_context_overrides=self._load_context_overrides,
        )

        fun._info = self._info
        fun._obj = obj
        fun._spec = self._spec  # TODO (elias): fix - this is incorrect when using with_options
        return fun

    @live_method
    async def update_autoscaler(
        self,
        *,
        min_containers: Optional[int] = None,
        max_containers: Optional[int] = None,
        buffer_containers: Optional[int] = None,
        scaledown_window: Optional[int] = None,
    ) -> None:
        """Override the current autoscaler behavior for this Function.

        Unspecified parameters will retain their current value, i.e. either the static value
        from the function decorator, or an override value from a previous call to this method.

        Subsequent deployments of the App containing this Function will reset the autoscaler back to
        its static configuration.

        Examples:

        ```python notest
        f = modal.Function.from_name("my-app", "function")

        # Always have at least 2 containers running, with an extra buffer when the Function is active
        f.update_autoscaler(min_containers=2, buffer_containers=1)

        # Limit this Function to avoid spinning up more than 5 containers
        f.update_autoscaler(max_containers=5)

        # Extend the scaledown window to increase the amount of time that idle containers stay alive
        f.update_autoscaler(scaledown_window=300)

        ```

        """
        if self._is_method:
            raise InvalidError("Cannot call .update_autoscaler() on a method. Call it on the class instance instead.")

        settings = api_pb2.AutoscalerSettings(
            min_containers=min_containers,
            max_containers=max_containers,
            buffer_containers=buffer_containers,
            scaledown_window=scaledown_window,
        )
        request = api_pb2.FunctionUpdateSchedulingParamsRequest(function_id=self.object_id, settings=settings)
        await self.client.stub.FunctionUpdateSchedulingParams(request)

        # One idea would be for FunctionUpdateScheduleParams to return the current (coalesced) settings
        # and then we could return them here (would need some ad hoc dataclass, which I don't love)

    @live_method
    async def keep_warm(self, warm_pool_size: int) -> None:
        """mdmd:hidden
        Set the warm pool size for the Function.

        DEPRECATED: Please adapt your code to use the more general `update_autoscaler` method instead:

        ```python notest
        f = modal.Function.from_name("my-app", "function")

        # Old pattern (deprecated)
        f.keep_warm(2)

        # New pattern
        f.update_autoscaler(min_containers=2)
        ```
        """
        if self._is_method:
            raise InvalidError(
                textwrap.dedent(
                    """
                The `.keep_warm()` method can not be used on Modal class *methods*.

                Call `.keep_warm()` on the class *instance* instead. All methods of a class are run by the same
                container pool, and this method applies to the size of that container pool.
            """
                )
            )

        deprecation_warning(
            (2025, 5, 5),
            "The .keep_warm() method has been deprecated in favor of the more general "
            ".update_autoscaler(min_containers=...) method.",
            show_source=True,
        )
        await self.update_autoscaler(min_containers=warm_pool_size)

    @classmethod
    def _from_name(
        cls,
        app_name: str,
        name: str,
        *,
        load_context_overrides: LoadContext,
    ):
        # internal function lookup implementation that allows lookup of class "service functions"
        # in addition to non-class functions
        async def _load_remote(
            self: _Function, resolver: Resolver, load_context: LoadContext, existing_object_id: Optional[str]
        ):
            request = api_pb2.FunctionGetRequest(
                app_name=app_name,
                object_tag=name,
                environment_name=load_context.environment_name,
            )
            try:
                response = await load_context.client.stub.FunctionGet(request)
            except NotFoundError as exc:
                # refine the error message
                env_context = (
                    f" (in the '{load_context.environment_name}' environment)" if load_context.environment_name else ""
                )
                raise NotFoundError(
                    f"Lookup failed for Function '{name}' from the '{app_name}' app{env_context}: {exc}."
                ) from None

            print_server_warnings(response.server_warnings)

            self._hydrate(response.function_id, load_context.client, response.handle_metadata)

        environment_rep = (
            f", environment_name={load_context_overrides.environment_name!r}"
            if load_context_overrides._environment_name  # slightly ugly - checking if _environment_name is overridden
            else ""
        )
        rep = f"modal.Function.from_name('{app_name}', '{name}'{environment_rep})"
        return cls._from_loader(
            _load_remote, rep, is_another_app=True, hydrate_lazily=True, load_context_overrides=load_context_overrides
        )

    @classmethod
    def from_name(
        cls: type["_Function"],
        app_name: str,
        name: str,
        *,
        namespace=None,  # mdmd:line-hidden
        environment_name: Optional[str] = None,
        client: Optional[_Client] = None,
    ) -> "_Function":
        """Reference a Function from a deployed App by its name.

        This is a lazy method that defers hydrating the local
        object with metadata from Modal servers until the first
        time it is actually used.

        ```python
        f = modal.Function.from_name("other-app", "function")
        ```
        """
        if "." in name:
            class_name, method_name = name.split(".", 1)
            deprecation_warning(
                (2025, 2, 11),
                "Looking up class methods using Function.from_name will be deprecated"
                " in a future version of Modal.\nUse modal.Cls.from_name instead, e.g.\n\n"
                f'{class_name} = modal.Cls.from_name("{app_name}", "{class_name}")\n'
                f"instance = {class_name}(...)\n"
                f"instance.{method_name}.remote(...)\n",
            )

        warn_if_passing_namespace(namespace, "modal.Function.from_name")
        return cls._from_name(
            app_name, name, load_context_overrides=LoadContext(environment_name=environment_name, client=client)
        )

    @property
    def tag(self) -> str:
        """mdmd:hidden"""
        assert self._tag
        return self._tag

    @property
    def app(self) -> "modal.app._App":
        """mdmd:hidden"""
        if self._app is None:
            raise ExecutionError("The app has not been assigned on the function at this point")

        return self._app

    @property
    def stub(self) -> "modal.app._App":
        """mdmd:hidden"""
        # Deprecated soon, only for backwards compatibility
        return self.app

    @property
    def info(self) -> FunctionInfo:
        """mdmd:hidden"""
        assert self._info
        return self._info

    @property
    def spec(self) -> _FunctionSpec:
        """mdmd:hidden"""
        assert self._spec
        return self._spec

    def _is_web_endpoint(self) -> bool:
        # only defined in definition scope/locally, and not for class methods at the moment
        return bool(self._webhook_config and self._webhook_config.type != api_pb2.WEBHOOK_TYPE_UNSPECIFIED)

    def get_build_def(self) -> str:
        """mdmd:hidden"""
        # Plaintext source and arg definition for the function, so it's part of the image
        # hash. We can't use the cloudpickle hash because it's not very stable.
        assert hasattr(self, "_raw_f") and hasattr(self, "_build_args") and self._raw_f is not None
        return f"{inspect.getsource(self._raw_f)}\n{repr(self._build_args)}"

    # Live handle methods

    def _initialize_from_empty(self):
        # Overridden concrete implementation of base class method
        self._progress = None
        self._is_generator = None
        self._web_url = None
        self._function_name = None
        self._info = None
        self._serve_mounts = frozenset()
        self._metadata = None
        self._experimental_flash_urls = None

    def _hydrate_metadata(self, metadata: Optional[Message]):
        # Overridden concrete implementation of base class method
        assert metadata and isinstance(metadata, api_pb2.FunctionHandleMetadata), (
            f"{type(metadata)} is not FunctionHandleMetadata"
        )
        self._metadata = metadata
        # TODO: replace usage of all below with direct ._metadata access
        self._is_generator = metadata.function_type == api_pb2.Function.FUNCTION_TYPE_GENERATOR
        self._web_url = metadata.web_url
        self._function_name = metadata.function_name
        self._is_method = metadata.is_method
        self._use_method_name = metadata.use_method_name
        self._class_parameter_info = metadata.class_parameter_info
        self._method_handle_metadata = dict(metadata.method_handle_metadata)
        self._definition_id = metadata.definition_id
        self._input_plane_url = metadata.input_plane_url
        self._input_plane_region = metadata.input_plane_region
        # The server may pass back a larger max object size for some input plane users. This applies to input plane
        # users only - anyone using the control plane will get the standard limit.
        # There are some cases like FunctionPrecreate where this value is not set at all. We expect that this field
        # will eventually be hydrated with the correct value, but just to be defensive, if the field is not set we use
        # MAX_OBJECT_SIZE_BYTES, otherwise it would get set to 0. Accidentally using 0 would cause us to blob upload
        # everything, so let's avoid that.
        self._max_object_size_bytes = (
            metadata.max_object_size_bytes if metadata.HasField("max_object_size_bytes") else MAX_OBJECT_SIZE_BYTES
        )
        self._experimental_flash_urls = metadata._experimental_flash_urls

    def _get_metadata(self):
        # Overridden concrete implementation of base class method
        assert self._function_name, f"Function name must be set before metadata can be retrieved for {self}"
        return api_pb2.FunctionHandleMetadata(
            function_name=self._function_name,
            function_type=get_function_type(self._is_generator),
            web_url=self._web_url or "",
            use_method_name=self._use_method_name,
            is_method=self._is_method,
            class_parameter_info=self._class_parameter_info,
            definition_id=self._definition_id,
            method_handle_metadata=self._method_handle_metadata,
            function_schema=self._metadata.function_schema if self._metadata else None,
            input_plane_url=self._input_plane_url,
            input_plane_region=self._input_plane_region,
            max_object_size_bytes=self._max_object_size_bytes,
            _experimental_flash_urls=self._experimental_flash_urls,
            supported_input_formats=self._metadata.supported_input_formats if self._metadata else [],
            supported_output_formats=self._metadata.supported_output_formats if self._metadata else [],
        )

    def _check_no_web_url(self, fn_name: str):
        if self._web_url:
            raise InvalidError(
                f"A webhook function cannot be invoked for remote execution with `.{fn_name}`. "
                f"Invoke this function via its web url '{self._web_url}' "
                + f"or call it locally: {self._function_name}.local()"
            )

    # TODO (live_method on properties is not great, since it could be blocking the event loop from async contexts)
    @property
    @live_method
    async def web_url(self) -> Optional[str]:
        """mdmd:hidden
        Deprecated. Use the `Function.get_web_url()` method instead.

        URL of a Function running as a web endpoint.
        """
        deprecation_msg = """The Function.web_url property will be removed in a future version of Modal.
Use the `Function.get_web_url()` method instead.
"""
        deprecation_warning((2025, 5, 6), deprecation_msg, pending=True)
        return self._web_url

    @live_method
    async def get_web_url(self) -> Optional[str]:
        """URL of a Function running as a web endpoint."""
        return self._web_url

    @live_method
    async def _experimental_get_flash_urls(self) -> Optional[list[str]]:
        """URL of the flash service for the function."""
        return list(self._experimental_flash_urls) if self._experimental_flash_urls else None

    @property
    async def is_generator(self) -> bool:
        """mdmd:hidden"""
        # hacky: kind of like @live_method, but not hydrating if we have the value already from local source
        # TODO(michael) use a common / lightweight method for handling unhydrated metadata properties
        if self._is_generator is not None:
            # this is set if the function or class is local
            return self._is_generator

        # not set - this is a from_name lookup - hydrate
        await self.hydrate()
        assert self._is_generator is not None  # should be set now
        return self._is_generator

    @live_method_gen
    async def _map(
        self,
        input_queue: _SynchronizedQueue,
        order_outputs: bool,
        return_exceptions: bool,
        wrap_returned_exceptions: bool,
    ) -> AsyncGenerator[Any, None]:
        """mdmd:hidden

        Synchronicity-wrapped map implementation. To be safe against invocations of user code in
        the synchronicity thread it doesn't accept an [async]iterator, and instead takes a
          _SynchronizedQueue instance that is fed by higher level functions like .map()

        _SynchronizedQueue is used instead of asyncio.Queue so that the main thread can put
        items in the queue safely.
        """
        self._check_no_web_url("map")
        if self._is_generator:
            raise InvalidError("A generator function cannot be called with `.map(...)`.")

        assert self._function_name
        if output_mgr := _get_output_manager():
            count_update_callback = output_mgr.function_progress_callback(self._function_name, total=None)
        else:
            count_update_callback = None

        if self._input_plane_url:
            async with aclosing(
                _map_invocation_inputplane(
                    self,
                    input_queue,
                    self.client,
                    order_outputs,
                    return_exceptions,
                    wrap_returned_exceptions,
                    count_update_callback,
                )
            ) as stream:
                async for item in stream:
                    yield item
        else:
            async with aclosing(
                _map_invocation(
                    self,
                    input_queue,
                    self.client,
                    order_outputs,
                    return_exceptions,
                    wrap_returned_exceptions,
                    count_update_callback,
                    api_pb2.FUNCTION_CALL_INVOCATION_TYPE_SYNC,
                )
            ) as stream:
                async for item in stream:
                    yield item

    @live_method
    async def _spawn_map(self, input_queue: _SynchronizedQueue) -> "_FunctionCall[ReturnType]":
        self._check_no_web_url("spawn_map")
        if self._is_generator:
            raise InvalidError("A generator function cannot be called with `.spawn_map(...)`.")

        assert self._function_name
        function_call_id, num_inputs = await _spawn_map_invocation(
            self,
            input_queue,
            self.client,
        )
        fc: _FunctionCall[ReturnType] = _FunctionCall._new_hydrated(function_call_id, self.client, None)
        fc._num_inputs = num_inputs  # set the cached value of num_inputs
        return fc

    async def _call_function(self, args, kwargs) -> ReturnType:
        invocation: Union[_Invocation, _InputPlaneInvocation]
        if self._input_plane_url:
            invocation = await _InputPlaneInvocation.create(
                self,
                args,
                kwargs,
                client=self.client,
                input_plane_url=self._input_plane_url,
                input_plane_region=self._input_plane_region,
            )
        else:
            invocation = await _Invocation.create(
                self,
                args,
                kwargs,
                client=self.client,
                function_call_invocation_type=api_pb2.FUNCTION_CALL_INVOCATION_TYPE_SYNC,
            )

        return await invocation.run_function()

    async def _call_function_nowait(
        self,
        args,
        kwargs,
        function_call_invocation_type: "api_pb2.FunctionCallInvocationType.ValueType",
        from_spawn_map: bool = False,
    ) -> _Invocation:
        return await _Invocation.create(
            self,
            args,
            kwargs,
            client=self.client,
            function_call_invocation_type=function_call_invocation_type,
            from_spawn_map=from_spawn_map,
        )

    @warn_if_generator_is_not_consumed()
    @live_method_gen
    @synchronizer.no_input_translation
    async def _call_generator(self, args, kwargs):
        invocation: Union[_Invocation, _InputPlaneInvocation]
        if self._input_plane_url:
            invocation = await _InputPlaneInvocation.create(
                self,
                args,
                kwargs,
                client=self.client,
                input_plane_url=self._input_plane_url,
                input_plane_region=self._input_plane_region,
            )
        else:
            invocation = await _Invocation.create(
                self,
                args,
                kwargs,
                client=self.client,
                function_call_invocation_type=api_pb2.FUNCTION_CALL_INVOCATION_TYPE_SYNC_LEGACY,
            )
        async for res in invocation.run_generator():
            yield res

    @synchronizer.no_io_translation
    @live_method
    async def remote(self, *args: P.args, **kwargs: P.kwargs) -> ReturnType:
        """
        Calls the function remotely, executing it with the given arguments and returning the execution's result.
        """
        # TODO: Generics/TypeVars
        self._check_no_web_url("remote")
        if self._is_generator:
            raise InvalidError(
                "A generator function cannot be called with `.remote(...)`. Use `.remote_gen(...)` instead."
            )

        return await self._call_function(args, kwargs)

    @synchronizer.no_io_translation
    @live_method_gen
    async def remote_gen(self, *args, **kwargs) -> AsyncGenerator[Any, None]:
        """
        Calls the generator remotely, executing it with the given arguments and returning the execution's result.
        """
        # TODO: Generics/TypeVars
        self._check_no_web_url("remote_gen")

        if not self._is_generator:
            raise InvalidError(
                "A non-generator function cannot be called with `.remote_gen(...)`. Use `.remote(...)` instead."
            )
        async for item in self._call_generator(args, kwargs):
            yield item

    def _is_local(self):
        return self._info is not None

    def _get_info(self) -> FunctionInfo:
        if not self._info:
            raise ExecutionError("Can't get info for a function that isn't locally defined")
        return self._info

    def _get_obj(self) -> Optional["modal.cls._Obj"]:
        if not self._is_method:
            return None
        elif not self._obj:
            raise ExecutionError("Method has no local object")
        else:
            return self._obj

    @synchronizer.nowrap
    def local(self, *args: P.args, **kwargs: P.kwargs) -> OriginalReturnType:
        """
        Calls the function locally, executing it with the given arguments and returning the execution's result.

        The function will execute in the same environment as the caller, just like calling the underlying function
        directly in Python. In particular, only secrets available in the caller environment will be available
        through environment variables.
        """
        # TODO(erikbern): it would be nice to remove the nowrap thing, but right now that would cause
        # "user code" to run on the synchronicity thread, which seems bad
        if not self._is_local():
            msg = (
                "The definition for this Function is missing, so it is not possible to invoke it locally. "
                "If this function was retrieved via `Function.from_name`, "
                "you need to use one of the remote invocation methods instead."
            )
            raise ExecutionError(msg)

        info = self._get_info()
        if not info.raw_f:
            # Here if calling .local on a service function itself which should never happen
            # TODO: check if we end up here in a container for a serialized function?
            raise ExecutionError("Can't call .local on service function")

        if is_local() and self.spec.volumes or self.spec.network_file_systems:
            warnings.warn(
                f"The {info.function_name} function is executing locally "
                + "and will not have access to the mounted Volume or NetworkFileSystem data"
            )

        obj: Optional["modal.cls._Obj"] = self._get_obj()

        if not obj:
            fun = info.raw_f
            return fun(*args, **kwargs)
        else:
            # This is a method on a class, so bind the self to the function
            user_cls_instance = obj._cached_user_cls_instance()
            fun = info.raw_f.__get__(user_cls_instance)

            # TODO: replace implicit local enter/exit with a context manager
            if is_async(info.raw_f):
                # We want to run __aenter__ and fun in the same coroutine
                async def coro():
                    await obj._aenter()
                    return await fun(*args, **kwargs)

                return coro()  # type: ignore
            else:
                obj._enter()
                return fun(*args, **kwargs)

    @synchronizer.no_input_translation
    @live_method
    async def _experimental_spawn(self, *args: P.args, **kwargs: P.kwargs) -> "_FunctionCall[ReturnType]":
        """[Experimental] Calls the function with the given arguments, without waiting for the results.

        This experimental version of the spawn method allows up to 1 million inputs to be spawned.

        Returns a `modal.FunctionCall` object, that can later be polled or
        waited for using `.get(timeout=...)`.
        Conceptually similar to `multiprocessing.pool.apply_async`, or a Future/Promise in other contexts.
        """
        self._check_no_web_url("_experimental_spawn")
        if self._is_generator:
            raise InvalidError("Cannot `spawn` a generator function.")
        else:
            invocation = await self._call_function_nowait(
                args, kwargs, function_call_invocation_type=api_pb2.FUNCTION_CALL_INVOCATION_TYPE_ASYNC
            )

        fc: _FunctionCall[ReturnType] = _FunctionCall._new_hydrated(
            invocation.function_call_id, invocation.client, None
        )
        fc._is_generator = self._is_generator if self._is_generator else False
        return fc

    @synchronizer.no_input_translation
    @live_method
    async def _spawn_map_inner(self, *args: P.args, **kwargs: P.kwargs) -> None:
        self._check_no_web_url("spawn_map")
        if self._is_generator:
            raise Exception("Cannot `spawn_map` over a generator function.")

        await self._call_function_nowait(args, kwargs, api_pb2.FUNCTION_CALL_INVOCATION_TYPE_ASYNC, from_spawn_map=True)

    @synchronizer.no_input_translation
    @live_method
    async def spawn(self, *args: P.args, **kwargs: P.kwargs) -> "_FunctionCall[ReturnType]":
        """Calls the function with the given arguments, without waiting for the results.

        Returns a [`modal.FunctionCall`](https://modal.com/docs/reference/modal.FunctionCall) object
        that can later be polled or waited for using
        [`.get(timeout=...)`](https://modal.com/docs/reference/modal.FunctionCall#get).
        Conceptually similar to `multiprocessing.pool.apply_async`, or a Future/Promise in other contexts.
        """
        self._check_no_web_url("spawn")
        if self._is_generator:
            raise InvalidError("Cannot `spawn` a generator function.")
        else:
            invocation = await self._call_function_nowait(args, kwargs, api_pb2.FUNCTION_CALL_INVOCATION_TYPE_ASYNC)

        fc: _FunctionCall[ReturnType] = _FunctionCall._new_hydrated(
            invocation.function_call_id, invocation.client, None
        )
        return fc

    def get_raw_f(self) -> Callable[..., Any]:
        """Return the inner Python object wrapped by this Modal Function."""
        assert self._raw_f is not None
        return self._raw_f

    @live_method
    async def get_current_stats(self) -> FunctionStats:
        """Return a `FunctionStats` object describing the current function's queue and runner counts."""
        resp = await self.client.stub.FunctionGetCurrentStats(
            api_pb2.FunctionGetCurrentStatsRequest(function_id=self.object_id),
            retry=Retry(total_timeout=10.0),
        )
        return FunctionStats(backlog=resp.backlog, num_total_runners=resp.num_total_tasks)

    @live_method
    async def _get_schema(self) -> api_pb2.FunctionSchema:
        """Returns recorded schema for function, internal use only for now"""
        assert self._metadata
        return self._metadata.function_schema

    # A bit hacky - but the map-style functions need to not be synchronicity-wrapped
    # in order to not execute their input iterators on the synchronicity event loop.
    # We still need to wrap them using MethodWithAio to maintain a synchronicity-like
    # api with `.aio` and get working type-stubs and reference docs generation:
    map = MethodWithAio(_map_sync, _map_async, synchronizer)
    starmap = MethodWithAio(_starmap_sync, _starmap_async, synchronizer)
    for_each = MethodWithAio(_for_each_sync, _for_each_async, synchronizer)
    spawn_map = MethodWithAio(_spawn_map_sync, _spawn_map_async, synchronizer)
    experimental_spawn_map = MethodWithAio(_experimental_spawn_map_sync, _experimental_spawn_map_async, synchronizer)


class _FunctionCall(typing.Generic[ReturnType], _Object, type_prefix="fc"):
    """A reference to an executed function call.

    Constructed using `.spawn(...)` on a Modal function with the same
    arguments that a function normally takes. Acts as a reference to
    an ongoing function call that can be passed around and used to
    poll or fetch function results at some later time.

    Conceptually similar to a Future/Promise/AsyncResult in other contexts and languages.
    """

    _is_generator: bool = False
    _num_inputs: Optional[int] = None

    def _invocation(self):
        return _Invocation(self.client.stub, self.object_id, self.client)

    @live_method
    async def num_inputs(self) -> int:
        """Get the number of inputs in the function call."""
        if self._num_inputs is None:
            request = api_pb2.FunctionCallFromIdRequest(function_call_id=self.object_id)
            resp = await self.client.stub.FunctionCallFromId(request)
            self._num_inputs = resp.num_inputs  # cached
        return self._num_inputs

    @live_method
    async def get(self, timeout: Optional[float] = None, *, index: int = 0) -> ReturnType:
        """Get the result of the index-th input of the function call.
        `.spawn()` calls have a single output, so only specifying `index=0` is valid.
        A non-zero index is useful when your function has multiple outputs, like via `.spawn_map()`.

        This function waits indefinitely by default. It takes an optional
        `timeout` argument that specifies the maximum number of seconds to wait,
        which can be set to `0` to poll for an output immediately.

        The returned coroutine is not cancellation-safe.
        """
        return await self._invocation().poll_function(timeout=timeout, index=index)

    @live_method_gen
    async def iter(self, *, start: int = 0, end: Optional[int] = None) -> AsyncIterator[ReturnType]:
        """Iterate in-order over the results of the function call.

        Optionally, specify a range [start, end) to iterate over.

        Example:
        ```python
        @app.function()
        def my_func(a):
            return a ** 2


        @app.local_entrypoint()
        def main():
            fc = my_func.spawn_map([1, 2, 3, 4])
            assert list(fc.iter()) == [1, 4, 9, 16]
            assert list(fc.iter(start=1, end=3)) == [4, 9]
        ```

        If `end` is not provided, it will iterate over all results.
        """
        num_inputs = await self.num_inputs()
        if end is None:
            end = num_inputs
        if start < 0 or end > num_inputs:
            raise ValueError(f"Invalid index range: {start} to {end} for {num_inputs} inputs")
        async for _, item in self._invocation().enumerate(start_index=start, end_index=end):
            yield item

    @live_method
    async def get_call_graph(self) -> list[InputInfo]:
        """Returns a structure representing the call graph from a given root
        call ID, along with the status of execution for each node.

        See [`modal.call_graph`](https://modal.com/docs/reference/modal.call_graph) reference page
        for documentation on the structure of the returned `InputInfo` items.
        """
        assert self._client and self._client.stub
        request = api_pb2.FunctionGetCallGraphRequest(function_call_id=self.object_id)
        response = await self._client.stub.FunctionGetCallGraph(request)
        return _reconstruct_call_graph(response)

    @live_method
    async def cancel(
        self,
        # if true, containers running the inputs are forcibly terminated
        terminate_containers: bool = False,
    ):
        """Cancels the function call, which will stop its execution and mark its inputs as
        [`TERMINATED`](https://modal.com/docs/reference/modal.call_graph#modalcall_graphinputstatus).

        If `terminate_containers=True` - the containers running the cancelled inputs are all terminated
        causing any non-cancelled inputs on those containers to be rescheduled in new containers.
        """
        request = api_pb2.FunctionCallCancelRequest(
            function_call_id=self.object_id, terminate_containers=terminate_containers
        )
        assert self._client and self._client.stub
        await self._client.stub.FunctionCallCancel(request)

    @deprecate_aio_usage((2025, 11, 14), "FunctionCall.from_id")
    @classmethod
    def from_id(
        cls, function_call_id: str, client: Optional["modal.client.Client"] = None
    ) -> "modal.functions.FunctionCall[Any]":
        """Instantiate a FunctionCall object from an existing ID.

        Examples:

        ```python notest
        # Spawn a FunctionCall and keep track of its object ID
        fc = my_func.spawn()
        fc_id = fc.object_id

        # Later, use the ID to re-instantiate the FunctionCall object
        fc = FunctionCall.from_id(fc_id)
        result = fc.get()
        ```

        Note that it's only necessary to re-instantiate the `FunctionCall` with this method
        if you no longer have access to the original object returned from `Function.spawn`.

        """
        _client = typing.cast(_Client, synchronizer._translate_in(client))

        async def _load(
            self: _FunctionCall, resolver: Resolver, load_context: LoadContext, existing_object_id: Optional[str]
        ):
            # this loader doesn't do anything in practice, but it will get the client from the load_context
            self._hydrate(function_call_id, load_context.client, None)

        rep = f"FunctionCall.from_id({function_call_id!r})"
        impl_instance = _FunctionCall._from_loader(
            _load, rep, hydrate_lazily=True, load_context_overrides=LoadContext(client=_client)
        )
        return typing.cast("modal.functions.FunctionCall[Any]", synchronizer._translate_out(impl_instance))

    @staticmethod
    async def gather(*function_calls: "_FunctionCall[T]") -> typing.Sequence[T]:
        """Wait until all Modal FunctionCall objects have results before returning.

        Accepts a variable number of `FunctionCall` objects, as returned by `Function.spawn()`.

        Returns a list of results from each FunctionCall, or raises an exception
        from the first failing function call.

        Examples:

        ```python notest
        fc1 = slow_func_1.spawn()
        fc2 = slow_func_2.spawn()

        result_1, result_2 = modal.FunctionCall.gather(fc1, fc2)
        ```

        *Added in v0.73.69*: This method replaces the deprecated `modal.functions.gather` function.
        """
        try:
            return await TaskContext.gather(*[fc.get() for fc in function_calls])
        except Exception as exc:
            # TODO: kill all running function calls
            raise exc


async def _gather(*function_calls: _FunctionCall[T]) -> typing.Sequence[T]:
    """mdmd:hidden
    Deprecated: Please use `modal.FunctionCall.gather()` instead."""
    deprecation_warning(
        (2025, 2, 24),
        "`modal.functions.gather()` is deprecated; please use `modal.FunctionCall.gather()` instead.",
    )
    return await _FunctionCall.gather(*function_calls)
