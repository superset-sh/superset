# Copyright Modal Labs 2024
import asyncio
import enum
import inspect
import time
import typing
from asyncio import FIRST_COMPLETED
from dataclasses import dataclass
from typing import Any, Callable, Optional, Union

from grpclib import Status

import modal.exception
from modal._runtime.execution_context import current_input_id
from modal._utils.async_utils import (
    AsyncOrSyncIterable,
    TimestampPriorityQueue,
    aclosing,
    async_map,
    async_map_ordered,
    async_merge,
    async_zip,
    queue_batch_iterator,
    run_coroutine_in_temporary_event_loop,
    sync_or_async_iter,
    synchronize_api,
    synchronizer,
    warn_if_generator_is_not_consumed,
)
from modal._utils.blob_utils import BLOB_MAX_PARALLELISM
from modal._utils.deprecation import deprecation_warning
from modal._utils.function_utils import (
    ATTEMPT_TIMEOUT_GRACE_PERIOD,
    OUTPUTS_TIMEOUT,
    _create_input,
    _process_result,
)
from modal._utils.grpc_utils import RETRYABLE_GRPC_STATUS_CODES, Retry, RetryWarningMessage
from modal._utils.jwt_utils import DecodedJwt
from modal.config import logger
from modal.retries import RetryManager
from modal_proto import api_pb2

if typing.TYPE_CHECKING:
    import modal.client

# pump_inputs should retry if it receives any of the standard retryable codes plus RESOURCE_EXHAUSTED.
PUMP_INPUTS_RETRYABLE_GRPC_STATUS_CODES = RETRYABLE_GRPC_STATUS_CODES + [Status.RESOURCE_EXHAUSTED]
PUMP_INPUTS_MAX_RETRIES = 8
PUMP_INPUTS_MAX_RETRY_DELAY = 15


class _SynchronizedQueue:
    """mdmd:hidden"""

    # small wrapper around asyncio.Queue to make it cross-thread compatible through synchronicity
    async def init(self):
        # in Python 3.8 the asyncio.Queue is bound to the event loop on creation
        # so it needs to be created in a synchronicity-wrapped init method
        self.q = asyncio.Queue()

    @synchronizer.no_io_translation
    async def put(self, item):
        await self.q.put(item)

    @synchronizer.no_io_translation
    async def get(self):
        return await self.q.get()


SynchronizedQueue = synchronize_api(_SynchronizedQueue)


@dataclass
class _OutputValue:
    # box class for distinguishing None results from non-existing/None markers
    value: Any


MAX_INPUTS_OUTSTANDING_DEFAULT = 1000

# Maximum number of inputs to send to the server per FunctionPutInputs request
MAP_INVOCATION_CHUNK_SIZE = 49
SPAWN_MAP_INVOCATION_CHUNK_SIZE = 512


if typing.TYPE_CHECKING:
    import modal.functions


class InputPreprocessor:
    """
    Constructs FunctionPutInputsItem objects from the raw-input queue, and puts them in the processed-input queue.
    """

    def __init__(
        self,
        client: "modal.client._Client",
        *,
        raw_input_queue: _SynchronizedQueue,
        processed_input_queue: asyncio.Queue,
        function: "modal.functions._Function",
        created_callback: Callable[[int], None],
        done_callback: Callable[[], None],
    ):
        self.client = client
        self.function = function
        self.inputs_created = 0
        self.raw_input_queue = raw_input_queue
        self.processed_input_queue = processed_input_queue
        self.created_callback = created_callback
        self.done_callback = done_callback

    async def input_iter(self):
        while 1:
            raw_input = await self.raw_input_queue.get()
            if raw_input is None:  # end of input sentinel
                break
            yield raw_input  # args, kwargs

    def create_input_factory(self):
        async def create_input(argskwargs):
            idx = self.inputs_created
            self.inputs_created += 1
            self.created_callback(self.inputs_created)
            (args, kwargs) = argskwargs
            return await _create_input(
                args,
                kwargs,
                self.client.stub,
                idx=idx,
                function=self.function,
            )

        return create_input

    async def drain_input_generator(self):
        # Parallelize uploading blobs
        async with aclosing(
            async_map_ordered(self.input_iter(), self.create_input_factory(), concurrency=BLOB_MAX_PARALLELISM)
        ) as streamer:
            async for item in streamer:
                await self.processed_input_queue.put(item)

        # close queue iterator
        await self.processed_input_queue.put(None)
        self.done_callback()
        yield


class InputPumper:
    """
    Reads inputs from a queue of FunctionPutInputsItems, and sends them to the server.
    """

    def __init__(
        self,
        client: "modal.client._Client",
        *,
        input_queue: asyncio.Queue,
        function: "modal.functions._Function",
        function_call_id: str,
        max_batch_size: int,
        map_items_manager: Optional["_MapItemsManager"] = None,
    ):
        self.client = client
        self.function = function
        self.map_items_manager = map_items_manager
        self.input_queue = input_queue
        self.inputs_sent = 0
        self.function_call_id = function_call_id
        self.max_batch_size = max_batch_size

    async def pump_inputs(self):
        assert self.client.stub
        async for items in queue_batch_iterator(self.input_queue, max_batch_size=self.max_batch_size):
            # Add items to the manager. Their state will be SENDING.
            if self.map_items_manager is not None:
                await self.map_items_manager.add_items(items)
            request = api_pb2.FunctionPutInputsRequest(
                function_id=self.function.object_id,
                inputs=items,
                function_call_id=self.function_call_id,
            )
            logger.debug(
                f"Pushing {len(items)} inputs to server. Num queued inputs awaiting"
                f" push is {self.input_queue.qsize()}. "
            )

            resp = await self.client.stub.FunctionPutInputs(request, retry=self._function_inputs_retry)
            self.inputs_sent += len(items)
            # Change item state to WAITING_FOR_OUTPUT, and set the input_id and input_jwt which are in the response.
            if self.map_items_manager is not None:
                self.map_items_manager.handle_put_inputs_response(resp.inputs)
            logger.debug(
                f"Successfully pushed {len(items)} inputs to server. "
                f"Num queued inputs awaiting push is {self.input_queue.qsize()}."
            )
        yield

    @property
    def _function_inputs_retry(self) -> Retry:
        # with 8 retries we log the warning below about every 30 seconds which isn't too spammy.
        retry_warning_message = RetryWarningMessage(
            message=f"Warning: map progress for function {self.function._function_name} is limited."
            " Common bottlenecks include slow iteration over results, or function backlogs.",
            warning_interval=8,
            errors_to_warn_for=[Status.RESOURCE_EXHAUSTED],
        )
        return Retry(
            max_retries=None,
            max_delay=PUMP_INPUTS_MAX_RETRY_DELAY,
            additional_status_codes=[Status.RESOURCE_EXHAUSTED],
            warning_message=retry_warning_message,
        )


class SyncInputPumper(InputPumper):
    def __init__(
        self,
        client: "modal.client._Client",
        *,
        input_queue: asyncio.Queue,
        retry_queue: TimestampPriorityQueue,
        function: "modal.functions._Function",
        function_call_jwt: str,
        function_call_id: str,
        map_items_manager: "_MapItemsManager",
    ):
        super().__init__(
            client,
            input_queue=input_queue,
            function=function,
            function_call_id=function_call_id,
            max_batch_size=MAP_INVOCATION_CHUNK_SIZE,
            map_items_manager=map_items_manager,
        )
        self.retry_queue = retry_queue
        self.inputs_retried = 0
        self.function_call_jwt = function_call_jwt

    async def retry_inputs(self):
        async for retriable_idxs in queue_batch_iterator(self.retry_queue, max_batch_size=self.max_batch_size):
            # For each index, use the context in the manager to create a FunctionRetryInputsItem.
            # This will also update the context state to RETRYING.
            inputs: list[api_pb2.FunctionRetryInputsItem] = await self.map_items_manager.prepare_items_for_retry(
                retriable_idxs
            )
            request = api_pb2.FunctionRetryInputsRequest(
                function_call_jwt=self.function_call_jwt,
                inputs=inputs,
            )
            resp = await self.client.stub.FunctionRetryInputs(request, retry=self._function_inputs_retry)
            # Update the state to WAITING_FOR_OUTPUT, and update the input_jwt in the context
            # to the new value in the response.
            self.map_items_manager.handle_retry_response(resp.input_jwts)
            logger.debug(f"Successfully pushed retry for {len(inputs)} to server.")
            self.inputs_retried += len(inputs)
        yield


class AsyncInputPumper(InputPumper):
    def __init__(
        self,
        client: "modal.client._Client",
        *,
        input_queue: asyncio.Queue,
        function: "modal.functions._Function",
        function_call_id: str,
    ):
        super().__init__(
            client,
            input_queue=input_queue,
            function=function,
            function_call_id=function_call_id,
            max_batch_size=SPAWN_MAP_INVOCATION_CHUNK_SIZE,
        )

    async def pump_inputs(self):
        async for _ in super().pump_inputs():
            pass
        request = api_pb2.FunctionFinishInputsRequest(
            function_id=self.function.object_id,
            function_call_id=self.function_call_id,
            num_inputs=self.inputs_sent,
        )
        await self.client.stub.FunctionFinishInputs(request, retry=Retry(max_retries=None))
        yield


async def _spawn_map_invocation(
    function: "modal.functions._Function", raw_input_queue: _SynchronizedQueue, client: "modal.client._Client"
) -> tuple[str, int]:
    assert client.stub
    request = api_pb2.FunctionMapRequest(
        function_id=function.object_id,
        parent_input_id=current_input_id() or "",
        function_call_type=api_pb2.FUNCTION_CALL_TYPE_MAP,
        function_call_invocation_type=api_pb2.FUNCTION_CALL_INVOCATION_TYPE_ASYNC,
    )
    response: api_pb2.FunctionMapResponse = await client.stub.FunctionMap(request)
    function_call_id = response.function_call_id

    have_all_inputs = False
    inputs_created = 0

    def set_inputs_created(set_inputs_created):
        nonlocal inputs_created
        assert set_inputs_created is None or set_inputs_created > inputs_created
        inputs_created = set_inputs_created

    def set_have_all_inputs():
        nonlocal have_all_inputs
        have_all_inputs = True

    input_queue: asyncio.Queue[api_pb2.FunctionPutInputsItem | None] = asyncio.Queue()
    input_preprocessor = InputPreprocessor(
        client=client,
        raw_input_queue=raw_input_queue,
        processed_input_queue=input_queue,
        function=function,
        created_callback=set_inputs_created,
        done_callback=set_have_all_inputs,
    )

    input_pumper = AsyncInputPumper(
        client=client,
        input_queue=input_queue,
        function=function,
        function_call_id=function_call_id,
    )

    def log_stats():
        logger.debug(
            f"have_all_inputs={have_all_inputs} inputs_created={inputs_created} inputs_sent={input_pumper.inputs_sent} "
        )

    async def log_task():
        while True:
            log_stats()
            try:
                await asyncio.sleep(10)
            except asyncio.CancelledError:
                # Log final stats before exiting
                log_stats()
                break

    async def consume_generator(gen):
        async for _ in gen:
            pass

    log_debug_stats_task = asyncio.create_task(log_task())
    await asyncio.gather(
        consume_generator(input_preprocessor.drain_input_generator()),
        consume_generator(input_pumper.pump_inputs()),
    )
    log_debug_stats_task.cancel()
    await log_debug_stats_task
    return function_call_id, inputs_created


async def _map_invocation(
    function: "modal.functions._Function",
    raw_input_queue: _SynchronizedQueue,
    client: "modal.client._Client",
    order_outputs: bool,
    return_exceptions: bool,
    wrap_returned_exceptions: bool,
    count_update_callback: Optional[Callable[[int, int], None]],
    function_call_invocation_type: "api_pb2.FunctionCallInvocationType.ValueType",
):
    assert client.stub
    request = api_pb2.FunctionMapRequest(
        function_id=function.object_id,
        parent_input_id=current_input_id() or "",
        function_call_type=api_pb2.FUNCTION_CALL_TYPE_MAP,
        return_exceptions=return_exceptions,
        function_call_invocation_type=function_call_invocation_type,
    )
    response: api_pb2.FunctionMapResponse = await client.stub.FunctionMap(request)

    function_call_id = response.function_call_id
    function_call_jwt = response.function_call_jwt
    retry_policy = response.retry_policy
    sync_client_retries_enabled = response.sync_client_retries_enabled
    # The server should always send a value back for max_inputs_outstanding.
    # Falling back to a default just in case something very unexpected happens.
    max_inputs_outstanding = response.max_inputs_outstanding or MAX_INPUTS_OUTSTANDING_DEFAULT

    have_all_inputs = False
    map_done_event = asyncio.Event()
    inputs_created = 0
    outputs_completed = 0
    outputs_received = 0
    retried_outputs = 0
    successful_completions = 0
    failed_completions = 0
    already_complete_duplicates = 0
    stale_retry_duplicates = 0
    no_context_duplicates = 0

    retry_queue = TimestampPriorityQueue()
    completed_outputs: set[str] = set()  # Set of input_ids whose outputs are complete (expecting no more values)
    input_queue: asyncio.Queue[api_pb2.FunctionPutInputsItem | None] = asyncio.Queue()
    map_items_manager = _MapItemsManager(
        retry_policy, function_call_invocation_type, retry_queue, sync_client_retries_enabled, max_inputs_outstanding
    )

    input_preprocessor = InputPreprocessor(
        client=client,
        raw_input_queue=raw_input_queue,
        processed_input_queue=input_queue,
        function=function,
        created_callback=lambda x: update_state(set_inputs_created=x),
        done_callback=lambda: update_state(set_have_all_inputs=True),
    )

    input_pumper = SyncInputPumper(
        client=client,
        input_queue=input_queue,
        retry_queue=retry_queue,
        function=function,
        map_items_manager=map_items_manager,
        function_call_jwt=function_call_jwt,
        function_call_id=function_call_id,
    )

    def update_state(set_have_all_inputs=None, set_inputs_created=None, set_outputs_completed=None):
        # This should be the only method that needs nonlocal of the following vars
        nonlocal have_all_inputs, inputs_created, outputs_completed
        assert set_have_all_inputs is not False  # not allowed
        assert set_inputs_created is None or set_inputs_created > inputs_created
        assert set_outputs_completed is None or set_outputs_completed > outputs_completed
        if set_have_all_inputs is not None:
            have_all_inputs = set_have_all_inputs
        if set_inputs_created is not None:
            inputs_created = set_inputs_created
        if set_outputs_completed is not None:
            outputs_completed = set_outputs_completed

        if count_update_callback is not None:
            count_update_callback(outputs_completed, inputs_created)

        if have_all_inputs and outputs_completed >= inputs_created:
            # map is done
            map_done_event.set()

    async def get_all_outputs():
        assert client.stub
        nonlocal \
            successful_completions, \
            failed_completions, \
            outputs_received, \
            already_complete_duplicates, \
            no_context_duplicates, \
            stale_retry_duplicates, \
            retried_outputs

        last_entry_id = "0-0"

        while not map_done_event.is_set():
            logger.debug(f"Requesting outputs. Have {outputs_completed} outputs, {inputs_created} inputs.")
            # Get input_jwts of all items in the WAITING_FOR_OUTPUT state.
            # The server uses these to track for lost inputs.
            input_jwts = [input_jwt for input_jwt in map_items_manager.get_input_jwts_waiting_for_output()]

            request = api_pb2.FunctionGetOutputsRequest(
                function_call_id=function_call_id,
                timeout=OUTPUTS_TIMEOUT,
                last_entry_id=last_entry_id,
                clear_on_success=False,
                requested_at=time.time(),
                input_jwts=input_jwts,
            )
            get_response_task = asyncio.create_task(
                client.stub.FunctionGetOutputs(
                    request,
                    retry=Retry(
                        max_retries=20,
                        attempt_timeout=OUTPUTS_TIMEOUT + ATTEMPT_TIMEOUT_GRACE_PERIOD,
                    ),
                )
            )
            map_done_task = asyncio.create_task(map_done_event.wait())
            try:
                done, pending = await asyncio.wait([get_response_task, map_done_task], return_when=FIRST_COMPLETED)
                if get_response_task in done:
                    map_done_task.cancel()
                    response = get_response_task.result()
                else:
                    assert map_done_event.is_set()
                    # map is done - no more outputs, so return early
                    return
            finally:
                # clean up tasks, in case of cancellations etc.
                get_response_task.cancel()
                map_done_task.cancel()

            last_entry_id = response.last_entry_id
            now_seconds = int(time.time())
            for item in response.outputs:
                outputs_received += 1
                # If the output failed, and there are retries remaining, the input will be placed on the
                # retry queue, and state updated to WAITING_FOR_RETRY. Otherwise, the output is considered
                # complete and the item is removed from the manager.
                output_type = await map_items_manager.handle_get_outputs_response(item, now_seconds)
                if output_type == _OutputType.SUCCESSFUL_COMPLETION:
                    successful_completions += 1
                elif output_type == _OutputType.FAILED_COMPLETION:
                    failed_completions += 1
                elif output_type == _OutputType.NO_CONTEXT_DUPLICATE:
                    no_context_duplicates += 1
                elif output_type == _OutputType.STALE_RETRY_DUPLICATE:
                    stale_retry_duplicates += 1
                elif output_type == _OutputType.ALREADY_COMPLETE_DUPLICATE:
                    already_complete_duplicates += 1
                elif output_type == _OutputType.RETRYING:
                    retried_outputs += 1

                if output_type == _OutputType.SUCCESSFUL_COMPLETION or output_type == _OutputType.FAILED_COMPLETION:
                    completed_outputs.add(item.input_id)
                    update_state(set_outputs_completed=outputs_completed + 1)
                    yield item

    async def get_all_outputs_and_clean_up():
        assert client.stub
        try:
            async with aclosing(get_all_outputs()) as output_items:
                async for item in output_items:
                    yield item
        finally:
            # "ack" that we have all outputs we are interested in and let backend clear results
            request = api_pb2.FunctionGetOutputsRequest(
                function_call_id=function_call_id,
                timeout=0,
                last_entry_id="0-0",
                clear_on_success=True,
                requested_at=time.time(),
            )
            await client.stub.FunctionGetOutputs(request)
            await retry_queue.close()

    async def fetch_output(item: api_pb2.FunctionGetOutputsItem) -> tuple[int, Any]:
        try:
            output = await _process_result(item.result, item.data_format, client.stub, client)
        except Exception as e:
            if return_exceptions:
                if wrap_returned_exceptions:
                    # Prior to client 1.0.4 there was a bug where return_exceptions would wrap
                    # any returned exceptions in a synchronicity.UserCodeException. This adds
                    # deprecated non-breaking compatibility bandaid for migrating away from that:
                    output = modal.exception.UserCodeException(e)
                else:
                    output = e
            else:
                raise e
        return (item.idx, output)

    async def poll_outputs():
        # map to store out-of-order outputs received
        received_outputs = {}
        output_idx = 0

        async with aclosing(
            async_map_ordered(get_all_outputs_and_clean_up(), fetch_output, concurrency=BLOB_MAX_PARALLELISM)
        ) as streamer:
            async for idx, output in streamer:
                if not order_outputs:
                    yield _OutputValue(output)
                else:
                    # hold on to outputs for function maps, so we can reorder them correctly.
                    received_outputs[idx] = output

                    while True:
                        if output_idx not in received_outputs:
                            # we haven't received the output for the current index yet.
                            # stop returning outputs to the caller and instead wait for
                            # the next output to arrive from the server.
                            break

                        output = received_outputs.pop(output_idx)
                        yield _OutputValue(output)
                        output_idx += 1

        assert len(received_outputs) == 0

    async def log_debug_stats():
        def log_stats():
            logger.debug(
                f"Map stats: sync_client_retries_enabled={sync_client_retries_enabled} "
                f"have_all_inputs={have_all_inputs} "
                f"inputs_created={inputs_created} "
                f"input_sent={input_pumper.inputs_sent} "
                f"inputs_retried={input_pumper.inputs_retried} "
                f"outputs_received={outputs_received} "
                f"successful_completions={successful_completions} failed_completions={failed_completions} "
                f"no_context_duplicates={no_context_duplicates} old_retry_duplicates={stale_retry_duplicates} "
                f"already_complete_duplicates={already_complete_duplicates} "
                f"retried_outputs={retried_outputs} input_queue_size={input_queue.qsize()} "
                f"retry_queue_size={retry_queue.qsize()} map_items_manager={len(map_items_manager)}"
            )

        while True:
            log_stats()
            try:
                await asyncio.sleep(10)
            except asyncio.CancelledError:
                # Log final stats before exiting
                log_stats()
                break

    log_debug_stats_task = asyncio.create_task(log_debug_stats())
    async with aclosing(
        async_merge(
            input_preprocessor.drain_input_generator(),
            input_pumper.pump_inputs(),
            input_pumper.retry_inputs(),
            poll_outputs(),
        )
    ) as streamer:
        async for response in streamer:
            if response is not None:  # type: ignore[unreachable]
                yield response.value
    log_debug_stats_task.cancel()
    await log_debug_stats_task


async def _map_invocation_inputplane(
    function: "modal.functions._Function",
    raw_input_queue: _SynchronizedQueue,
    client: "modal.client._Client",
    order_outputs: bool,
    return_exceptions: bool,
    wrap_returned_exceptions: bool,
    count_update_callback: Optional[Callable[[int, int], None]],
) -> typing.AsyncGenerator[Any, None]:
    """Input-plane implementation of a function map invocation.

    This is analogous to `_map_invocation`, but instead of the control-plane
    `FunctionMap` / `FunctionPutInputs` / `FunctionGetOutputs` RPCs it speaks
    the input-plane protocol consisting of `MapStartOrContinue`, `MapAwait`, and `MapCheckInputs`.
    """

    assert function._input_plane_url, "_map_invocation_inputplane should only be used for input-plane backed functions"

    input_plane_stub = await client.get_stub(function._input_plane_url)

    # Required for _create_input.
    assert client.stub, "Client must be hydrated with a stub for _map_invocation_inputplane"

    # ------------------------------------------------------------
    # Invocation-wide state
    # ------------------------------------------------------------

    have_all_inputs = False
    map_done_event = asyncio.Event()

    inputs_created = 0
    outputs_completed = 0
    successful_completions = 0
    failed_completions = 0
    no_context_duplicates = 0
    stale_retry_duplicates = 0
    already_complete_duplicates = 0
    retried_outputs = 0
    input_queue_size = 0
    last_entry_id = ""

    # The input-plane server returns this after the first request.
    map_token = None
    map_token_received = asyncio.Event()

    # Single priority queue that holds *both* fresh inputs (timestamp == now)
    # and future retries (timestamp > now).
    queue: TimestampPriorityQueue[api_pb2.MapStartOrContinueItem] = TimestampPriorityQueue()

    # Maximum number of inputs that may be in-flight (the server sends this in
    # the first response – fall back to the default if we never receive it for
    # any reason).
    max_inputs_outstanding = MAX_INPUTS_OUTSTANDING_DEFAULT

    # Set a default retry policy to construct an instance of _MapItemsManager.
    # We'll update the retry policy with the actual user-specified retry policy
    # from the server in the first MapStartOrContinue response.
    retry_policy = api_pb2.FunctionRetryPolicy(
        retries=0,
        initial_delay_ms=1000,
        max_delay_ms=1000,
        backoff_coefficient=1.0,
    )
    map_items_manager = _MapItemsManager(
        retry_policy=retry_policy,
        function_call_invocation_type=api_pb2.FUNCTION_CALL_INVOCATION_TYPE_SYNC,
        retry_queue=queue,
        sync_client_retries_enabled=True,
        max_inputs_outstanding=MAX_INPUTS_OUTSTANDING_DEFAULT,
        is_input_plane_instance=True,
    )

    def update_counters(
        created_delta: int = 0, completed_delta: int = 0, set_have_all_inputs: Union[bool, None] = None
    ):
        nonlocal inputs_created, outputs_completed, have_all_inputs

        if created_delta:
            inputs_created += created_delta
        if completed_delta:
            outputs_completed += completed_delta
        if set_have_all_inputs is not None:
            have_all_inputs = set_have_all_inputs

        if count_update_callback is not None:
            count_update_callback(outputs_completed, inputs_created)

        if have_all_inputs and outputs_completed >= inputs_created:
            map_done_event.set()

    async def create_input(argskwargs):
        idx = inputs_created + 1  # 1-indexed map call idx
        update_counters(created_delta=1)
        (args, kwargs) = argskwargs
        put_item: api_pb2.FunctionPutInputsItem = await _create_input(
            args,
            kwargs,
            client.stub,
            idx=idx,
            function=function,
        )
        return api_pb2.MapStartOrContinueItem(input=put_item)

    async def input_iter():
        while True:
            raw_input = await raw_input_queue.get()
            if raw_input is None:  # end of input sentinel
                break
            yield raw_input  # args, kwargs

    async def drain_input_generator():
        async with aclosing(
            async_map_ordered(input_iter(), create_input, concurrency=BLOB_MAX_PARALLELISM)
        ) as streamer:
            async for q_item in streamer:
                await queue.put(time.time(), q_item)

        # All inputs have been read.
        update_counters(set_have_all_inputs=True)
        yield

    async def pump_inputs():
        nonlocal map_token, max_inputs_outstanding
        async for batch in queue_batch_iterator(queue, max_batch_size=MAP_INVOCATION_CHUNK_SIZE):
            # Convert the queued items into the proto format expected by the RPC.
            request_items: list[api_pb2.MapStartOrContinueItem] = [
                api_pb2.MapStartOrContinueItem(input=qi.input, attempt_token=qi.attempt_token) for qi in batch
            ]

            await map_items_manager.add_items_inputplane(request_items)

            # Build request
            request = api_pb2.MapStartOrContinueRequest(
                function_id=function.object_id,
                map_token=map_token,
                parent_input_id=current_input_id() or "",
                items=request_items,
            )

            metadata = await client.get_input_plane_metadata(function._input_plane_region)

            response: api_pb2.MapStartOrContinueResponse = await input_plane_stub.MapStartOrContinue(
                request,
                retry=Retry(
                    additional_status_codes=[Status.RESOURCE_EXHAUSTED],
                    max_delay=PUMP_INPUTS_MAX_RETRY_DELAY,
                    max_retries=None,
                ),
                metadata=metadata,
            )

            # match response items to the corresponding request item index
            response_items_idx_tuple = [
                (request_items[idx].input.idx, attempt_token)
                for idx, attempt_token in enumerate(response.attempt_tokens)
            ]

            map_items_manager.handle_put_continue_response(response_items_idx_tuple)

            # Set the function call id and actual retry policy with the data from the first response.
            # This conditional is skipped for subsequent iterations of this for-loop.
            if map_token is None:
                map_token = response.map_token
                map_token_received.set()
                max_inputs_outstanding = response.max_inputs_outstanding or MAX_INPUTS_OUTSTANDING_DEFAULT
                map_items_manager.set_retry_policy(response.retry_policy)
                # Update the retry policy for the first batch of inputs.
                # Subsequent batches will have the correct user-specified retry policy
                # set by the updated _MapItemsManager.
                map_items_manager.update_items_retry_policy(response.retry_policy)
        yield

    async def check_lost_inputs():
        nonlocal last_entry_id  # shared with get_all_outputs
        try:
            while not map_done_event.is_set():
                if map_token is None:
                    await map_token_received.wait()
                    continue

                sleep_task = asyncio.create_task(asyncio.sleep(1))
                map_done_task = asyncio.create_task(map_done_event.wait())
                done, _ = await asyncio.wait([sleep_task, map_done_task], return_when=FIRST_COMPLETED)
                if map_done_task in done:
                    break

                # check_inputs = [(idx, attempt_token), ...]
                check_inputs = map_items_manager.get_input_idxs_waiting_for_output()
                attempt_tokens = [attempt_token for _, attempt_token in check_inputs]
                request = api_pb2.MapCheckInputsRequest(
                    last_entry_id=last_entry_id,
                    timeout=0,  # Non-blocking read
                    attempt_tokens=attempt_tokens,
                )

                metadata = await client.get_input_plane_metadata(function._input_plane_region)
                response: api_pb2.MapCheckInputsResponse = await input_plane_stub.MapCheckInputs(
                    request, metadata=metadata
                )
                check_inputs_response = [
                    (check_inputs[resp_idx][0], response.lost[resp_idx]) for resp_idx, _ in enumerate(response.lost)
                ]
                # check_inputs_response = [(idx, lost: bool), ...]
                await map_items_manager.handle_check_inputs_response(check_inputs_response)
            yield
        except asyncio.CancelledError:
            pass

    async def get_all_outputs():
        nonlocal \
            successful_completions, \
            failed_completions, \
            no_context_duplicates, \
            stale_retry_duplicates, \
            already_complete_duplicates, \
            retried_outputs, \
            last_entry_id

        while not map_done_event.is_set():
            if map_token is None:
                await map_token_received.wait()
                continue

            request = api_pb2.MapAwaitRequest(
                map_token=map_token,
                last_entry_id=last_entry_id,
                requested_at=time.time(),
                timeout=OUTPUTS_TIMEOUT,
            )
            metadata = await client.get_input_plane_metadata(function._input_plane_region)
            get_response_task = asyncio.create_task(
                input_plane_stub.MapAwait(
                    request,
                    retry=Retry(
                        max_retries=20,
                        attempt_timeout=OUTPUTS_TIMEOUT + ATTEMPT_TIMEOUT_GRACE_PERIOD,
                    ),
                    metadata=metadata,
                )
            )
            map_done_task = asyncio.create_task(map_done_event.wait())
            try:
                done, pending = await asyncio.wait([get_response_task, map_done_task], return_when=FIRST_COMPLETED)
                if get_response_task in done:
                    map_done_task.cancel()
                    response = get_response_task.result()
                else:
                    assert map_done_event.is_set()
                    # map is done - no more outputs, so return early
                    return
            finally:
                # clean up tasks, in case of cancellations etc.
                get_response_task.cancel()
                map_done_task.cancel()
            last_entry_id = response.last_entry_id

            for output_item in response.outputs:
                output_type = await map_items_manager.handle_get_outputs_response(output_item, int(time.time()))
                if output_type == _OutputType.SUCCESSFUL_COMPLETION:
                    successful_completions += 1
                elif output_type == _OutputType.FAILED_COMPLETION:
                    failed_completions += 1
                elif output_type == _OutputType.RETRYING:
                    retried_outputs += 1
                elif output_type == _OutputType.NO_CONTEXT_DUPLICATE:
                    no_context_duplicates += 1
                elif output_type == _OutputType.STALE_RETRY_DUPLICATE:
                    stale_retry_duplicates += 1
                elif output_type == _OutputType.ALREADY_COMPLETE_DUPLICATE:
                    already_complete_duplicates += 1
                else:
                    raise Exception(f"Unknown output type: {output_type}")

                if output_type == _OutputType.SUCCESSFUL_COMPLETION or output_type == _OutputType.FAILED_COMPLETION:
                    update_counters(completed_delta=1)
                    yield output_item

    async def get_all_outputs_and_clean_up():
        try:
            async with aclosing(get_all_outputs()) as stream:
                async for item in stream:
                    yield item
        finally:
            await queue.close()
            pass

    async def fetch_output(item: api_pb2.FunctionGetOutputsItem) -> tuple[int, Any]:
        try:
            output = await _process_result(item.result, item.data_format, input_plane_stub, client)
        except Exception as e:
            if return_exceptions:
                if wrap_returned_exceptions:
                    # Prior to client 1.0.4 there was a bug where return_exceptions would wrap
                    # any returned exceptions in a synchronicity.UserCodeException. This adds
                    # deprecated non-breaking compatibility bandaid for migrating away from that:
                    output = modal.exception.UserCodeException(e)
                else:
                    output = e
            else:
                raise e
        return (item.idx, output)

    async def poll_outputs():
        # map to store out-of-order outputs received
        received_outputs = {}
        output_idx = 1  # 1-indexed map call idx

        async with aclosing(
            async_map_ordered(get_all_outputs_and_clean_up(), fetch_output, concurrency=BLOB_MAX_PARALLELISM)
        ) as streamer:
            async for idx, output in streamer:
                if not order_outputs:
                    yield _OutputValue(output)
                else:
                    # hold on to outputs for function maps, so we can reorder them correctly.
                    received_outputs[idx] = output

                    while True:
                        if output_idx not in received_outputs:
                            # we haven't received the output for the current index yet.
                            # stop returning outputs to the caller and instead wait for
                            # the next output to arrive from the server.
                            break

                        output = received_outputs.pop(output_idx)
                        yield _OutputValue(output)
                        output_idx += 1

        assert len(received_outputs) == 0

    async def log_debug_stats():
        def log_stats():
            logger.debug(
                f"Map stats:\nsuccessful_completions={successful_completions} failed_completions={failed_completions} "
                f"no_context_duplicates={no_context_duplicates} stale_retry_duplicates={stale_retry_duplicates} "
                f"already_complete_duplicates={already_complete_duplicates} retried_outputs={retried_outputs} "
                f"map_token={map_token} max_inputs_outstanding={max_inputs_outstanding} "
                f"map_items_manager_size={len(map_items_manager)} input_queue_size={input_queue_size}"
            )

        while True:
            log_stats()
            try:
                await asyncio.sleep(10)
            except asyncio.CancelledError:
                # Log final stats before exiting
                log_stats()
                break

    log_task = asyncio.create_task(log_debug_stats())

    async with aclosing(
        async_merge(drain_input_generator(), pump_inputs(), poll_outputs(), check_lost_inputs())
    ) as merged:
        async for maybe_output in merged:
            if maybe_output is not None:  # ignore None sentinels
                yield maybe_output.value

    log_task.cancel()


async def _map_helper(
    self: "modal.functions.Function",
    async_input_gen: typing.AsyncGenerator[Any, None],
    kwargs={},  # any extra keyword arguments for the function
    order_outputs: bool = True,  # return outputs in order
    return_exceptions: bool = False,  # propagate exceptions (False) or aggregate them in the results list (True)
    wrap_returned_exceptions: bool = True,
) -> typing.AsyncGenerator[Any, None]:
    """Core implementation that supports `_map_async()`, `_starmap_async()` and `_for_each_async()`.

    Runs in an event loop on the main thread. Concurrently feeds new input to the input queue and yields available
    outputs to the caller.

    Note that since the iterator(s) can block, it's a bit opaque how often the event
    loop decides to get a new input vs how often it will emit a new output.

    We could make this explicit as an improvement or even let users decide what they
    prefer: throughput (prioritize queueing inputs) or latency (prioritize yielding results)
    """
    raw_input_queue: Any = SynchronizedQueue()  # type: ignore
    await raw_input_queue.init.aio()

    async def feed_queue():
        async with aclosing(async_input_gen) as streamer:
            async for args in streamer:
                await raw_input_queue.put.aio((args, kwargs))
        await raw_input_queue.put.aio(None)  # end-of-input sentinel
        if False:
            # make this a never yielding generator so we can async_merge it below
            # this is important so any exception raised in feed_queue will be propagated
            yield

    # note that `map()`, `map.aio()`, `starmap()`, `starmap.aio()`, `for_each()`, `for_each.aio()` are not
    # synchronicity-wrapped, since they accept executable code in the form of iterators that we don't want to run inside
    # the synchronicity thread. Instead, we delegate to `._map()` with a safer Queue as input.
    async with aclosing(
        async_merge(
            self._map.aio(raw_input_queue, order_outputs, return_exceptions, wrap_returned_exceptions), feed_queue()
        )
    ) as map_output_stream:
        async for output in map_output_stream:
            yield output


def _maybe_warn_about_exceptions(func_name: str, return_exceptions: bool, wrap_returned_exceptions: bool):
    if return_exceptions and wrap_returned_exceptions:
        deprecation_warning(
            (2025, 6, 27),
            (
                f"Function.{func_name} currently leaks an internal exception wrapping type "
                "(modal.exceptions.UserCodeException) when `return_exceptions=True` is set. "
                "In the future, this will change, and the underlying exception will be returned directly.\n"
                "To opt into the future behavior and silence this warning, add `wrap_returned_exceptions=False`:\n\n"
                f"    f.{func_name}(..., return_exceptions=True, wrap_returned_exceptions=False)"
            ),
        )


def _invoked_from_sync_wrapper() -> bool:
    """Check whether the calling function was called from a sync wrapper."""
    # This is temporary: we only need it to avoind double-firing the wrap_returned_exceptions warning.
    # (We don't want to push the warning lower in the stack beacuse then we can't attribute to the user's code.)
    try:
        frame = inspect.currentframe()
        caller_function_name = frame.f_back.f_back.f_code.co_name
        # Embeds some assumptions about how the current calling stack works, but this is just temporary.
        return caller_function_name == "asend"
    except Exception:
        return False


@warn_if_generator_is_not_consumed(function_name="Function.map.aio")
async def _map_async(
    self: "modal.functions.Function",
    *input_iterators: typing.Union[
        typing.Iterable[Any], typing.AsyncIterable[Any]
    ],  # one input iterator per argument in the mapped-over function/generator
    kwargs={},  # any extra keyword arguments for the function
    order_outputs: bool = True,  # return outputs in order
    return_exceptions: bool = False,  # propagate exceptions (False) or aggregate them in the results list (True)
    wrap_returned_exceptions: bool = True,  # wrap returned exceptions in modal.exception.UserCodeException
) -> typing.AsyncGenerator[Any, None]:
    if not _invoked_from_sync_wrapper():
        _maybe_warn_about_exceptions("map.aio", return_exceptions, wrap_returned_exceptions)
    async_input_gen = async_zip(*[sync_or_async_iter(it) for it in input_iterators])
    async for output in _map_helper(
        self,
        async_input_gen,
        kwargs=kwargs,
        order_outputs=order_outputs,
        return_exceptions=return_exceptions,
        wrap_returned_exceptions=wrap_returned_exceptions,
    ):
        yield output


@warn_if_generator_is_not_consumed(function_name="Function.starmap.aio")
async def _starmap_async(
    self,
    input_iterator: typing.Union[typing.Iterable[typing.Sequence[Any]], typing.AsyncIterable[typing.Sequence[Any]]],
    *,
    kwargs={},
    order_outputs: bool = True,
    return_exceptions: bool = False,
    wrap_returned_exceptions: bool = True,
) -> typing.AsyncIterable[Any]:
    if not _invoked_from_sync_wrapper():
        _maybe_warn_about_exceptions("starmap.aio", return_exceptions, wrap_returned_exceptions)
    async for output in _map_helper(
        self,
        sync_or_async_iter(input_iterator),
        kwargs=kwargs,
        order_outputs=order_outputs,
        return_exceptions=return_exceptions,
        wrap_returned_exceptions=wrap_returned_exceptions,
    ):
        yield output


async def _for_each_async(self, *input_iterators, kwargs={}, ignore_exceptions: bool = False) -> None:
    # TODO(erikbern): it would be better if this is more like a map_spawn that immediately exits
    # rather than iterating over the result
    async_input_gen = async_zip(*[sync_or_async_iter(it) for it in input_iterators])
    async for _ in _map_helper(
        self,
        async_input_gen,
        kwargs=kwargs,
        order_outputs=False,
        return_exceptions=ignore_exceptions,
        wrap_returned_exceptions=False,
    ):
        pass


@warn_if_generator_is_not_consumed(function_name="Function.map")
def _map_sync(
    self,
    *input_iterators: typing.Iterable[Any],  # one input iterator per argument in the mapped-over function/generator
    kwargs={},  # any extra keyword arguments for the function
    order_outputs: bool = True,  # return outputs in order
    return_exceptions: bool = False,  # propagate exceptions (False) or aggregate them in the results list (True)
    wrap_returned_exceptions: bool = True,
) -> AsyncOrSyncIterable:
    """Parallel map over a set of inputs.

    Takes one iterator argument per argument in the function being mapped over.

    Example:
    ```python
    @app.function()
    def my_func(a):
        return a ** 2


    @app.local_entrypoint()
    def main():
        assert list(my_func.map([1, 2, 3, 4])) == [1, 4, 9, 16]
    ```

    If applied to a `app.function`, `map()` returns one result per input and the output order
    is guaranteed to be the same as the input order. Set `order_outputs=False` to return results
    in the order that they are completed instead.

    `return_exceptions` can be used to treat exceptions as successful results:

    ```python
    @app.function()
    def my_func(a):
        if a == 2:
            raise Exception("ohno")
        return a ** 2


    @app.local_entrypoint()
    def main():
        # [0, 1, UserCodeException(Exception('ohno'))]
        print(list(my_func.map(range(3), return_exceptions=True)))
    ```
    """
    _maybe_warn_about_exceptions("map", return_exceptions, wrap_returned_exceptions)

    return AsyncOrSyncIterable(
        _map_async(
            self,
            *input_iterators,
            kwargs=kwargs,
            order_outputs=order_outputs,
            return_exceptions=return_exceptions,
            wrap_returned_exceptions=wrap_returned_exceptions,
        ),
        nested_async_message=(
            "You can't iter(Function.map()) from an async function. Use async for ... in Function.map.aio() instead."
        ),
    )


async def _experimental_spawn_map_async(self, *input_iterators, kwargs={}) -> "modal.functions._FunctionCall":
    async_input_gen = async_zip(*[sync_or_async_iter(it) for it in input_iterators])
    return await _spawn_map_helper(self, async_input_gen, kwargs)


async def _spawn_map_helper(
    self: "modal.functions.Function", async_input_gen, kwargs={}
) -> "modal.functions._FunctionCall":
    raw_input_queue: Any = SynchronizedQueue()  # type: ignore
    await raw_input_queue.init.aio()

    async def feed_queue():
        async with aclosing(async_input_gen) as streamer:
            async for args in streamer:
                await raw_input_queue.put.aio((args, kwargs))
        await raw_input_queue.put.aio(None)  # end-of-input sentinel

    fc, _ = await asyncio.gather(self._spawn_map.aio(raw_input_queue), feed_queue())
    return fc


def _experimental_spawn_map_sync(self, *input_iterators, kwargs={}) -> "modal.functions._FunctionCall":
    """mdmd:hidden
    Spawn parallel execution over a set of inputs, returning as soon as the inputs are created.

    Unlike `modal.Function.map`, this method does not block on completion of the remote execution but
    returns a `modal.FunctionCall` object that can be used to poll status and retrieve results later.

    Takes one iterator argument per argument in the function being mapped over.

    Example:
    ```python
    @app.function()
    def my_func(a, b):
        return a ** b


    @app.local_entrypoint()
    def main():
        fc = my_func.spawn_map([1, 2], [3, 4])
    ```

    """

    return run_coroutine_in_temporary_event_loop(
        _experimental_spawn_map_async(self, *input_iterators, kwargs=kwargs),
        "You can't run Function.spawn_map() from an async function. Use Function.spawn_map.aio() instead.",
    )


async def _spawn_map_async(self, *input_iterators, kwargs={}) -> None:
    """This runs in an event loop on the main thread. It consumes inputs from the input iterators and creates async
    function calls for each.
    """

    def _call_with_args(args):
        """
        Returns co-routine that invokes a function with the given arguments.

        On RESOURCE_EXHAUSTED, it will retry indefinitely with exponential backoff up to 30 seconds. Every 10 retriable
        errors, log a warning that the function call is waiting to be created.
        """

        return self._spawn_map_inner.aio(*args, **kwargs)

    input_gen = async_zip(*[sync_or_async_iter(it) for it in input_iterators])

    # TODO(gongy): Can improve this by creating async_foreach method which foregoes async_merge.
    async for _ in async_map(input_gen, _call_with_args, concurrency=256):
        pass


def _spawn_map_sync(self, *input_iterators, kwargs={}) -> None:
    """Spawn parallel execution over a set of inputs, exiting as soon as the inputs are created (without waiting
    for the map to complete).

    Takes one iterator argument per argument in the function being mapped over.

    Example:
    ```python
    @app.function()
    def my_func(a):
        return a ** 2


    @app.local_entrypoint()
    def main():
        my_func.spawn_map([1, 2, 3, 4])
    ```

    Programmatic retrieval of results will be supported in a future update.
    """

    return run_coroutine_in_temporary_event_loop(
        _spawn_map_async(self, *input_iterators, kwargs=kwargs),
        "You can't run Function.spawn_map() from an async function. Use Function.spawn_map.aio() instead.",
    )


def _for_each_sync(self, *input_iterators, kwargs={}, ignore_exceptions: bool = False):
    """Execute function for all inputs, ignoring outputs. Waits for completion of the inputs.

    Convenient alias for `.map()` in cases where the function just needs to be called.
    as the caller doesn't have to consume the generator to process the inputs.
    """

    return run_coroutine_in_temporary_event_loop(
        _for_each_async(self, *input_iterators, kwargs=kwargs, ignore_exceptions=ignore_exceptions),
        nested_async_message=(
            "You can't run `Function.for_each()` from an async function. Use `await Function.for_each.aio()` instead."
        ),
    )


@warn_if_generator_is_not_consumed(function_name="Function.starmap")
def _starmap_sync(
    self,
    input_iterator: typing.Iterable[typing.Sequence[Any]],
    *,
    kwargs={},
    order_outputs: bool = True,
    return_exceptions: bool = False,
    wrap_returned_exceptions: bool = True,
) -> AsyncOrSyncIterable:
    """Like `map`, but spreads arguments over multiple function arguments.

    Assumes every input is a sequence (e.g. a tuple).

    Example:
    ```python
    @app.function()
    def my_func(a, b):
        return a + b


    @app.local_entrypoint()
    def main():
        assert list(my_func.starmap([(1, 2), (3, 4)])) == [3, 7]
    ```
    """
    _maybe_warn_about_exceptions("starmap", return_exceptions, wrap_returned_exceptions)
    return AsyncOrSyncIterable(
        _starmap_async(
            self,
            input_iterator,
            kwargs=kwargs,
            order_outputs=order_outputs,
            return_exceptions=return_exceptions,
            wrap_returned_exceptions=wrap_returned_exceptions,
        ),
        nested_async_message=(
            "You can't `iter(Function.starmap())` from an async function. "
            "Use `async for ... in Function.starmap.aio()` instead."
        ),
    )


class _MapItemState(enum.Enum):
    # The input is being sent the server with a PutInputs request, but the response has not been received yet.
    SENDING = 1
    # A call to either PutInputs or FunctionRetry has completed, and we are waiting to receive the output.
    WAITING_FOR_OUTPUT = 2
    # The input is on the retry queue, and waiting for its delay to expire.
    WAITING_TO_RETRY = 3
    # The input is being sent to the server with a FunctionRetry request, but the response has not been received yet.
    RETRYING = 4
    # The output has been received and was either successful, or failed with no more retries remaining.
    COMPLETE = 5


class _OutputType(enum.Enum):
    SUCCESSFUL_COMPLETION = 1
    FAILED_COMPLETION = 2
    RETRYING = 3
    ALREADY_COMPLETE_DUPLICATE = 4
    STALE_RETRY_DUPLICATE = 5
    NO_CONTEXT_DUPLICATE = 6


class _MapItemContext:
    state: _MapItemState
    input: api_pb2.FunctionInput
    retry_manager: RetryManager
    sync_client_retries_enabled: bool
    # Both these futures are strings. Omitting generic type because
    # it causes an error when running `inv protoc type-stubs`.
    # Unused. But important, input_id is not set for inputplane invocations.
    input_id: asyncio.Future
    input_jwt: asyncio.Future
    previous_input_jwt: Optional[str]
    _event_loop: asyncio.AbstractEventLoop

    def __init__(
        self,
        input: api_pb2.FunctionInput,
        retry_manager: RetryManager,
        sync_client_retries_enabled: bool,
        is_input_plane_instance: bool = False,
    ):
        self.state = _MapItemState.SENDING
        self.input = input
        self.retry_manager = retry_manager
        self.sync_client_retries_enabled = sync_client_retries_enabled
        self._event_loop = asyncio.get_event_loop()
        # create a future for each input, to be resolved when we have
        # received the input ID and JWT from the server. this addresses
        # a race condition where we could receive outputs before we have
        # recorded the input ID and JWT in `pending_outputs`.
        self.input_jwt = self._event_loop.create_future()
        # Unused. But important, this is not set for inputplane invocations.
        self.input_id = self._event_loop.create_future()
        self._is_input_plane_instance = is_input_plane_instance

    def handle_map_start_or_continue_response(self, attempt_token: str):
        if not self.input_jwt.done():
            self.input_jwt.set_result(attempt_token)
        else:
            # Create a new future for the next value
            self.input_jwt = asyncio.Future()
            self.input_jwt.set_result(attempt_token)

        # Set state to WAITING_FOR_OUTPUT only if current state is SENDING. If state is
        # RETRYING, WAITING_TO_RETRY, or COMPLETE, then we already got the output.
        if self.state == _MapItemState.SENDING:
            self.state = _MapItemState.WAITING_FOR_OUTPUT

    def handle_put_inputs_response(self, item: api_pb2.FunctionPutInputsResponseItem):
        self.input_jwt.set_result(item.input_jwt)
        self.input_id.set_result(item.input_id)
        # Set state to WAITING_FOR_OUTPUT only if current state is SENDING. If state is
        # RETRYING, WAITING_TO_RETRY, or COMPLETE, then we already got the output.
        if self.state == _MapItemState.SENDING:
            self.state = _MapItemState.WAITING_FOR_OUTPUT

    async def handle_get_outputs_response(
        self,
        item: api_pb2.FunctionGetOutputsItem,
        now_seconds: int,
        function_call_invocation_type: "api_pb2.FunctionCallInvocationType.ValueType",
        retry_queue: TimestampPriorityQueue,
    ) -> _OutputType:
        """
        Processes the output, and determines if it is complete or needs to be retried.

        Return True if input state was changed to COMPLETE, otherwise False.
        """
        # If the item is already complete, this is a duplicate output and can be ignored.

        if self.state == _MapItemState.COMPLETE:
            logger.debug(
                f"Received output for input marked as complete. Must be duplicate, so ignoring. "
                f"idx={item.idx} input_id={item.input_id} retry_count={item.retry_count}"
            )
            return _OutputType.ALREADY_COMPLETE_DUPLICATE
        # If the item's retry count doesn't match our retry count, this is probably a duplicate of an old output.
        if item.retry_count != self.retry_manager.retry_count:
            logger.debug(
                f"Received output with stale retry_count, so ignoring. "
                f"idx={item.idx} input_id={item.input_id} retry_count={item.retry_count} "
                f"expected_retry_count={self.retry_manager.retry_count}"
            )
            return _OutputType.STALE_RETRY_DUPLICATE

        # retry failed inputs when the function call invocation type is SYNC
        if (
            item.result.status == api_pb2.GenericResult.GENERIC_STATUS_SUCCESS
            or function_call_invocation_type != api_pb2.FUNCTION_CALL_INVOCATION_TYPE_SYNC
            or not self.sync_client_retries_enabled
        ):
            self.state = _MapItemState.COMPLETE
            if item.result.status == api_pb2.GenericResult.GENERIC_STATUS_SUCCESS:
                return _OutputType.SUCCESSFUL_COMPLETION
            else:
                return _OutputType.FAILED_COMPLETION

        # Get the retry delay and increment the retry count.
        # TODO(ryan): We must call this for lost inputs - even though we will set the retry delay to 0 later -
        # because we must increment the retry count. That's awkward, let's come up with something better.
        # TODO(ryan):To maintain parity with server-side retries, retrying lost inputs should not count towards
        # the retry policy. However we use the retry_count number as a unique identifier on each attempt to:
        #  1) ignore duplicate outputs
        #  2) ignore late outputs received from previous attempts
        #  3) avoid a server race condition between FunctionRetry and GetOutputs that results in deleted input metadata
        # For now, lost inputs will count towards the retry policy. But let's address this in another PR, perhaps by
        # tracking total attempts and attempts which count towards the retry policy separately.
        delay_ms = self.retry_manager.get_delay_ms()

        # For system failures on the server, we retry immediately.
        # and the failure does not count towards the retry policy.
        if item.result.status == api_pb2.GenericResult.GENERIC_STATUS_INTERNAL_FAILURE:
            delay_ms = 0

        # None means the maximum number of retries has been reached, so output the error
        if delay_ms is None or item.result.status == api_pb2.GenericResult.GENERIC_STATUS_TERMINATED:
            self.state = _MapItemState.COMPLETE
            return _OutputType.FAILED_COMPLETION

        self.state = _MapItemState.WAITING_TO_RETRY

        if self._is_input_plane_instance:
            retry_item = await self.create_map_start_or_continue_item(item.idx)
            await retry_queue.put(now_seconds + delay_ms / 1_000, retry_item)
        else:
            await retry_queue.put(now_seconds + delay_ms / 1_000, item.idx)

        return _OutputType.RETRYING

    async def prepare_item_for_retry(self) -> api_pb2.FunctionRetryInputsItem:
        self.state = _MapItemState.RETRYING
        # If the input_jwt is not set, then put_inputs hasn't returned yet. Block until we have it.
        input_jwt = await self.input_jwt
        self.input_jwt = self._event_loop.create_future()
        return api_pb2.FunctionRetryInputsItem(
            input_jwt=input_jwt,
            input=self.input,
            retry_count=self.retry_manager.retry_count,
        )

    def set_retry_policy(self, retry_policy: api_pb2.FunctionRetryPolicy):
        self.retry_manager = RetryManager(retry_policy)

    def handle_retry_response(self, input_jwt: str):
        self.input_jwt.set_result(input_jwt)
        self.state = _MapItemState.WAITING_FOR_OUTPUT

    async def create_map_start_or_continue_item(self, idx: int) -> api_pb2.MapStartOrContinueItem:
        attempt_token = await self.input_jwt
        return api_pb2.MapStartOrContinueItem(
            input=api_pb2.FunctionPutInputsItem(
                input=self.input,
                idx=idx,
            ),
            attempt_token=attempt_token,
        )


class _MapItemsManager:
    def __init__(
        self,
        retry_policy: api_pb2.FunctionRetryPolicy,
        function_call_invocation_type: "api_pb2.FunctionCallInvocationType.ValueType",
        retry_queue: TimestampPriorityQueue,
        sync_client_retries_enabled: bool,
        max_inputs_outstanding: int,
        is_input_plane_instance: bool = False,
    ):
        self._retry_policy = retry_policy
        self.function_call_invocation_type = function_call_invocation_type
        self._retry_queue = retry_queue
        # semaphore to control the maximum number of inputs that can be in progress (either queued to be sent,
        # or waiting for completion). if this limit is reached, we will block sending more inputs to the server
        # until some of the existing inputs are completed.
        self._inputs_outstanding = asyncio.BoundedSemaphore(max_inputs_outstanding)
        self._item_context: dict[int, _MapItemContext] = {}
        self._sync_client_retries_enabled = sync_client_retries_enabled
        self._is_input_plane_instance = is_input_plane_instance

    def set_retry_policy(self, retry_policy: api_pb2.FunctionRetryPolicy):
        self._retry_policy = retry_policy

    async def add_items(self, items: list[api_pb2.FunctionPutInputsItem]):
        for item in items:
            # acquire semaphore to limit the number of inputs in progress
            # (either queued to be sent, waiting for completion, or retrying)
            await self._inputs_outstanding.acquire()
            self._item_context[item.idx] = _MapItemContext(
                input=item.input,
                retry_manager=RetryManager(self._retry_policy),
                sync_client_retries_enabled=self._sync_client_retries_enabled,
            )

    async def add_items_inputplane(self, items: list[api_pb2.MapStartOrContinueItem]):
        for item in items:
            # acquire semaphore to limit the number of inputs in progress
            # (either queued to be sent, waiting for completion, or retrying)
            if item.attempt_token != "":  # if it is a retry item
                self._item_context[item.input.idx].state = _MapItemState.SENDING
                continue
            await self._inputs_outstanding.acquire()
            self._item_context[item.input.idx] = _MapItemContext(
                input=item.input.input,
                retry_manager=RetryManager(self._retry_policy),
                sync_client_retries_enabled=self._sync_client_retries_enabled,
                is_input_plane_instance=self._is_input_plane_instance,
            )

    async def prepare_items_for_retry(self, retriable_idxs: list[int]) -> list[api_pb2.FunctionRetryInputsItem]:
        return [await self._item_context[idx].prepare_item_for_retry() for idx in retriable_idxs]

    def update_items_retry_policy(self, retry_policy: api_pb2.FunctionRetryPolicy):
        for ctx in self._item_context.values():
            ctx.set_retry_policy(retry_policy)

    def get_input_jwts_waiting_for_output(self) -> list[str]:
        """
        Returns a list of input_jwts for inputs that are waiting for output.
        """
        # If input_jwt is not done, the call to PutInputs has not completed, so omit it from results.
        return [
            ctx.input_jwt.result()
            for ctx in self._item_context.values()
            if ctx.state == _MapItemState.WAITING_FOR_OUTPUT and ctx.input_jwt.done()
        ]

    def get_input_idxs_waiting_for_output(self) -> list[tuple[int, str]]:
        """
        Returns a list of input_idxs for inputs that are waiting for output.
        """
        # Idx doesn't need a future because it is set by client and not server.
        return [
            (idx, ctx.input_jwt.result())
            for idx, ctx in self._item_context.items()
            if ctx.state == _MapItemState.WAITING_FOR_OUTPUT and ctx.input_jwt.done()
        ]

    def _remove_item(self, item_idx: int):
        del self._item_context[item_idx]
        self._inputs_outstanding.release()

    def get_item_context(self, item_idx: int) -> _MapItemContext:
        return self._item_context.get(item_idx)

    def handle_put_continue_response(
        self,
        items: list[tuple[int, str]],  # idx, input_jwt
    ):
        for index, item in items:
            ctx = self._item_context.get(index, None)
            # If the context is None, then get_all_outputs() has already received a successful
            # output, and deleted the context. This happens if FunctionGetOutputs completes
            # before MapStartOrContinueResponse is received.
            if ctx is not None:
                ctx.handle_map_start_or_continue_response(item)

    def handle_put_inputs_response(self, items: list[api_pb2.FunctionPutInputsResponseItem]):
        for item in items:
            ctx = self._item_context.get(item.idx, None)
            # If the context is None, then get_all_outputs() has already received a successful
            # output, and deleted the context. This happens if FunctionGetOutputs completes
            # before FunctionPutInputsResponse is received.
            if ctx is not None:
                ctx.handle_put_inputs_response(item)

    def handle_retry_response(self, input_jwts: list[str]):
        for input_jwt in input_jwts:
            decoded_jwt = DecodedJwt.decode_without_verification(input_jwt)
            ctx = self._item_context.get(decoded_jwt.payload["idx"], None)
            # If the context is None, then get_all_outputs() has already received a successful
            # output, and deleted the context. This happens if FunctionGetOutputs completes
            # before FunctionRetryInputsResponse is received.
            if ctx is not None:
                ctx.handle_retry_response(input_jwt)

    async def handle_check_inputs_response(self, response: list[tuple[int, bool]]):
        for idx, lost in response:
            ctx = self._item_context.get(idx, None)
            if ctx is not None:
                if lost:
                    ctx.state = _MapItemState.WAITING_TO_RETRY
                    retry_item = await ctx.create_map_start_or_continue_item(idx)
                    _ = ctx.retry_manager.get_delay_ms()  # increment retry count but instant retry for lost inputs
                    await self._retry_queue.put(time.time(), retry_item)

    async def handle_get_outputs_response(self, item: api_pb2.FunctionGetOutputsItem, now_seconds: int) -> _OutputType:
        ctx = self._item_context.get(item.idx, None)
        if ctx is None:
            # We've already processed this output, so we can skip it.
            # This can happen because the worker can sometimes send duplicate outputs.
            logger.debug(
                f"Received output that does not have entry in item_context map, so ignoring. "
                f"idx={item.idx} input_id={item.input_id} retry_count={item.retry_count} "
            )
            return _OutputType.NO_CONTEXT_DUPLICATE
        output_type = await ctx.handle_get_outputs_response(
            item, now_seconds, self.function_call_invocation_type, self._retry_queue
        )
        if output_type == _OutputType.SUCCESSFUL_COMPLETION or output_type == _OutputType.FAILED_COMPLETION:
            self._remove_item(item.idx)
        return output_type

    def __len__(self):
        return len(self._item_context)
