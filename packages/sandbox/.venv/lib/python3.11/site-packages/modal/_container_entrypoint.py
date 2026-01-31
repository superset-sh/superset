# Copyright Modal Labs 2022
# ruff: noqa: E402
import os

from modal._runtime.user_code_imports import (
    Service,
    import_class_service,
    import_server_service,
    import_single_function_service,
)

telemetry_socket = os.environ.get("MODAL_TELEMETRY_SOCKET")
if telemetry_socket:
    from ._runtime.telemetry import instrument_imports

    instrument_imports(telemetry_socket)

import asyncio
import queue
import signal
import threading
import time
import types
from typing import TYPE_CHECKING, Any, Optional, cast

from google.protobuf.message import Message

from modal._clustered_functions import initialize_clustered_function
from modal._runtime.user_code_event_loop import UserCodeEventLoop
from modal._serialization import deserialize, deserialize_params
from modal._utils.async_utils import TaskContext, aclosing, synchronizer
from modal.app import App, _App
from modal.client import Client, _Client
from modal.config import logger
from modal.exception import ExecutionError, InputCancellation
from modal.running_app import RunningApp, running_app_from_layout
from modal_proto import api_pb2

from ._runtime import execution_context
from ._runtime.container_io_manager import (
    ContainerIOManager,
    IOContext,
    UserException,
)

if TYPE_CHECKING:
    import modal._runtime.container_io_manager
    import modal._runtime.user_code_imports


class DaemonizedThreadPool:
    # Used instead of ThreadPoolExecutor, since the latter won't allow
    # the interpreter to shut down before the currently running tasks
    # have finished
    def __init__(self, max_threads: int):
        self.max_threads = max_threads

    def __enter__(self):
        self.spawned_workers = 0
        self.inputs: queue.Queue[Any] = queue.Queue()
        self.finished = threading.Event()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.finished.set()

        if exc_type is None:
            self.inputs.join()
        else:
            # special case - allows us to exit the
            if self.inputs.unfinished_tasks:
                logger.info(
                    f"Exiting DaemonizedThreadPool with {self.inputs.unfinished_tasks} active "
                    f"inputs due to exception: {repr(exc_type)}"
                )

    def submit(self, func, *args):
        def worker_thread():
            while not self.finished.is_set():
                try:
                    _func, _args = self.inputs.get(timeout=1)
                except queue.Empty:
                    continue
                try:
                    _func(*_args)
                except BaseException:
                    logger.exception(f"Exception raised by {_func} in DaemonizedThreadPool worker!")
                self.inputs.task_done()

        if self.spawned_workers < self.max_threads:
            threading.Thread(target=worker_thread, daemon=True).start()
            self.spawned_workers += 1

        self.inputs.put((func, args))


def call_function(
    user_code_event_loop: UserCodeEventLoop,
    container_io_manager: "modal._runtime.container_io_manager.ContainerIOManager",
    finalized_functions: dict[str, "modal._runtime.user_code_imports.FinalizedFunction"],
    batch_max_size: int,
    batch_wait_ms: int,
):
    async def run_input_async(io_context: IOContext) -> None:
        reset_context = execution_context._set_current_context_ids(
            io_context.input_ids, io_context.function_call_ids, io_context.attempt_tokens
        )
        started_at = time.time()
        async with container_io_manager.handle_input_exception.aio(io_context, started_at):
            # TODO(erikbern): any exception below shouldn't be considered a user exception
            if io_context.finalized_function.is_generator:
                # Send up to this many outputs at a time.
                current_function_call_id = execution_context.current_function_call_id()
                assert current_function_call_id is not None  # Set above.
                current_attempt_token = execution_context.current_attempt_token()
                assert current_attempt_token is not None  # Set above, but can be empty string.
                generator_queue: asyncio.Queue[Any] = await container_io_manager._queue_create.aio(1024)
                async with container_io_manager.generator_output_sender(
                    current_function_call_id,
                    current_attempt_token,
                    io_context._generator_output_format(),
                    generator_queue,
                ):
                    item_count = 0
                    async with aclosing(io_context.call_generator_async()) as gen:
                        async for value in gen:
                            await container_io_manager._queue_put.aio(generator_queue, value)
                            item_count += 1

                await container_io_manager._send_outputs.aio(
                    started_at, io_context.output_items_generator_done(started_at, item_count)
                )
            else:
                value = await io_context.call_function_async()
                await container_io_manager.push_outputs.aio(
                    io_context,
                    started_at,
                    value,
                )
        reset_context()

    def run_input_sync(io_context: IOContext) -> None:
        started_at = time.time()
        reset_context = execution_context._set_current_context_ids(
            io_context.input_ids, io_context.function_call_ids, io_context.attempt_tokens
        )
        with container_io_manager.handle_input_exception(io_context, started_at):
            # TODO(erikbern): any exception below shouldn't be considered a user exception
            if io_context.finalized_function.is_generator:
                gen = io_context.call_generator_sync()
                # Send up to this many outputs at a time.
                current_function_call_id = execution_context.current_function_call_id()
                assert current_function_call_id is not None  # Set above.
                current_attempt_token = execution_context.current_attempt_token()
                assert current_attempt_token is not None  # Set above, but can be empty string.
                generator_queue: asyncio.Queue[Any] = container_io_manager._queue_create(1024)
                with container_io_manager.generator_output_sender(
                    current_function_call_id,
                    current_attempt_token,
                    io_context._generator_output_format(),
                    generator_queue,
                ):
                    item_count = 0
                    for value in gen:
                        container_io_manager._queue_put(generator_queue, value)
                        item_count += 1

                container_io_manager._send_outputs(
                    started_at, io_context.output_items_generator_done(started_at, item_count)
                )
            else:
                values = io_context.call_function_sync()
                container_io_manager.push_outputs(io_context, started_at, values)
        reset_context()

    if container_io_manager.input_concurrency_enabled:
        with DaemonizedThreadPool(max_threads=container_io_manager.max_concurrency) as thread_pool:

            def make_async_cancel_callback(task):
                def f():
                    user_code_event_loop.loop.call_soon_threadsafe(task.cancel)

                return f

            did_sigint = False

            def cancel_callback_sync():
                nonlocal did_sigint
                # We only want one sigint even if multiple inputs are cancelled
                # A second sigint would forcibly shut down the event loop and spew
                # out a bunch of tracebacks, which we only want to happen in case
                # the worker kills this process after a failed self-termination
                if not did_sigint:
                    did_sigint = True
                    logger.warning(
                        "User cancelling input of non-async functions with input concurrency enabled.\n"
                        "This shuts down the container, causing concurrently running inputs to be "
                        "rescheduled in other containers."
                    )
                    os.kill(os.getpid(), signal.SIGINT)

            async def run_concurrent_inputs():
                # all run_input coroutines will have completed by the time we leave the execution context
                # but the wrapping *tasks* may not yet have been resolved, so we add a 0.01s
                # for them to resolve gracefully:
                async with TaskContext(0.01) as task_context:
                    async for io_context in container_io_manager.run_inputs_outputs.aio(
                        finalized_functions, batch_max_size, batch_wait_ms
                    ):
                        # Note that run_inputs_outputs will not return until all the input slots are released
                        # so that they can be acquired by the run_inputs_outputs finalizer
                        # This prevents leaving the task_context before outputs have been created
                        # TODO: refactor to make this a bit more easy to follow?
                        if io_context.finalized_function.is_async:
                            input_task = task_context.create_task(run_input_async(io_context))
                            io_context.set_cancel_callback(make_async_cancel_callback(input_task))
                        else:
                            # run sync input in thread
                            thread_pool.submit(run_input_sync, io_context)
                            io_context.set_cancel_callback(cancel_callback_sync)

            user_code_event_loop.run(run_concurrent_inputs())
    else:
        for io_context in container_io_manager.run_inputs_outputs(finalized_functions, batch_max_size, batch_wait_ms):
            # This goes to a registered signal handler for sync Modal functions, or to the
            # `UserCodeEventLoop` for async functions.
            #
            # We only send this signal on functions that do not have concurrent inputs enabled.
            # This allows us to do fine-grained input cancellation. On sync functions, the
            # SIGUSR1 signal should interrupt the main thread where user code is running,
            # raising an InputCancellation() exception. On async functions, the signal should
            # reach a handler in UserCodeEventLoop, which cancels the task.
            io_context.set_cancel_callback(lambda: os.kill(os.getpid(), signal.SIGUSR1))

            if io_context.finalized_function.is_async:
                user_code_event_loop.run(run_input_async(io_context))
            else:
                # Set up a custom signal handler for `SIGUSR1`, which gets translated to an InputCancellation
                # during function execution. This is sent to cancel inputs from the user
                def _cancel_input_signal_handler(signum, stackframe):
                    raise InputCancellation("Input was cancelled by user")

                usr1_handler = signal.signal(signal.SIGUSR1, _cancel_input_signal_handler)
                # run this sync code in the main thread, blocking the "userland" event loop
                # this lets us cancel it using a signal handler that raises an exception
                try:
                    run_input_sync(io_context)
                finally:
                    signal.signal(signal.SIGUSR1, usr1_handler)  # reset signal handler


def get_serialized_user_class_and_function(
    function_def: api_pb2.Function, client: _Client
) -> tuple[Optional[type], Optional[types.FunctionType]]:
    if function_def.definition_type == api_pb2.Function.DEFINITION_TYPE_SERIALIZED:
        assert function_def.function_serialized or function_def.class_serialized

        if function_def.function_serialized:
            ser_fun = deserialize(function_def.function_serialized, client)
        else:
            ser_fun = None

        if function_def.class_serialized:
            ser_usr_cls = deserialize(function_def.class_serialized, client)
        else:
            ser_usr_cls = None
    else:
        ser_usr_cls, ser_fun = None, None

    return ser_usr_cls, ser_fun


def main(container_args: api_pb2.ContainerArguments, client: Client):
    # This is a bit weird but we need both the blocking and async versions of ContainerIOManager.
    # At some point, we should fix that by having built-in support for running "user code"
    container_io_manager = ContainerIOManager(container_args, client)
    active_app: _App
    service: Service
    function_def = container_args.function_def
    # The worker sets this flag to "1" for snapshot and restore tasks. Otherwise, this flag is unset,
    # in which case snapshots should be disabled.
    is_snapshotting_function = (
        function_def.is_checkpointing_function and os.environ.get("MODAL_ENABLE_SNAP_RESTORE") == "1"
    )

    _client: _Client = cast(_Client, synchronizer._translate_in(client))  # TODO(erikbern): ugly

    # Call ContainerHello - currently a noop but might be used later for things
    container_io_manager.hello()

    with container_io_manager.heartbeats(is_snapshotting_function), UserCodeEventLoop() as event_loop:
        # If this is a serialized function, fetch the definition from the server
        ser_usr_cls, ser_fun = get_serialized_user_class_and_function(function_def, _client)

        # Initialize the function, importing user code.
        with container_io_manager.handle_user_exception():
            if container_args.serialized_params:
                param_args, param_kwargs = deserialize_params(container_args.serialized_params, function_def, _client)
            else:
                param_args = ()
                param_kwargs = {}

            with execution_context._import_context():
                if function_def.is_server:
                    service_base_function_id = container_args.app_layout.function_ids[function_def.function_name]
                    service_function_hydration_data = [
                        o for o in container_args.app_layout.objects if o.object_id == service_base_function_id
                    ][0]
                    service = import_server_service(
                        function_def,
                        service_function_hydration_data,
                        client,
                        ser_usr_cls,
                    )
                elif function_def.is_class:
                    # this is a bit ugly - match the function and class based on function name to get metadata
                    # This metadata is required in order to hydrate the class in case it's not globally
                    # decorated (or serialized)
                    service_base_function_id = container_args.app_layout.function_ids[function_def.function_name]
                    service_function_hydration_data = [
                        o for o in container_args.app_layout.objects if o.object_id == service_base_function_id
                    ][0]
                    class_id = container_args.app_layout.class_ids[function_def.function_name.removesuffix(".*")]

                    service = import_class_service(
                        function_def,
                        service_function_hydration_data,
                        class_id,
                        client,
                        ser_usr_cls,
                        param_args,
                        param_kwargs,
                    )
                else:
                    assert ser_usr_cls is None
                    service = import_single_function_service(
                        function_def,
                        ser_fun,
                    )

            active_app = service.app

            if function_def.pty_info.pty_type == api_pb2.PTYInfo.PTY_TYPE_SHELL:
                # Concurrency and batching doesn't apply for `modal shell`.
                batch_max_size = 0
                batch_wait_ms = 0
            else:
                batch_max_size = function_def.batch_max_size or 0
                batch_wait_ms = function_def.batch_linger_ms or 0

        # Get ids and metadata for objects (primarily functions and classes) on the app
        container_app: RunningApp = running_app_from_layout(container_args.app_id, container_args.app_layout)

        # Initialize objects on the app.
        # This is basically only functions and classes - anything else is deprecated and will be unsupported soon
        app: App = cast(App, synchronizer._translate_out(active_app))
        app._init_container(client, container_app)

        # Hydrate all function dependencies.
        # TODO(erikbern): we an remove this once we
        # 1. Enable lazy hydration for all objects
        # 2. Fully deprecate .new() objects
        if service.service_deps is not None:  # this is not set for serialized or non-global scope functions
            dep_object_ids: list[str] = [dep.object_id for dep in function_def.object_dependencies]
            if len(service.service_deps) != len(dep_object_ids):
                raise ExecutionError(
                    f"Function has {len(service.service_deps)} dependencies"
                    f" but container got {len(dep_object_ids)} object ids.\n"
                    f"Code deps: {service.service_deps}\n"
                    f"Object ids: {dep_object_ids}\n"
                    "\n"
                    "This can happen if you are defining Modal objects under a conditional statement "
                    "that evaluates differently in the local and remote environments."
                )
            for object_id, obj in zip(dep_object_ids, service.service_deps):
                metadata: Optional[Message] = container_app.object_handle_metadata[object_id]
                obj._hydrate(object_id, _client, metadata)

        # Initialize clustered functions.
        if function_def._experimental_group_size > 0:
            initialize_clustered_function(
                client,
                container_args.task_id,
                function_def._experimental_group_size,
            )

        with service.execution_context(event_loop, container_io_manager) as finalized_functions:
            call_function(event_loop, container_io_manager, finalized_functions, batch_max_size, batch_wait_ms)


if __name__ == "__main__":
    logger.debug("Container: starting")

    container_args = api_pb2.ContainerArguments()
    container_arguments_path: Optional[str] = os.environ.get("MODAL_CONTAINER_ARGUMENTS_PATH")
    if container_arguments_path is None:
        raise RuntimeError("No path to the container arguments file provided!")
    container_args.ParseFromString(open(container_arguments_path, "rb").read())

    # Note that we're creating the client in a synchronous context, but it will be running in a separate thread.
    # This is good because if the function is long running then we the client can still send heartbeats
    # The only caveat is a bunch of calls will now cross threads, which adds a bit of overhead?
    client = Client.from_env()

    try:
        main(container_args, client)
    except UserException:
        logger.info("User exception caught, exiting")
    except KeyboardInterrupt:
        logger.debug("Container: interrupted")

    # Detect if any non-daemon threads are still running, which will prevent the Python interpreter
    # from shutting down. The sleep(0) here is needed for finished ThreadPoolExecutor resources to
    # shut down without triggering this warning (e.g., `@wsgi_app()`).
    time.sleep(0)
    lingering_threads: list[threading.Thread] = []
    for thread in threading.enumerate():
        current_thread = threading.get_ident()
        if thread.ident is not None and thread.ident != current_thread and not thread.daemon and thread.is_alive():
            lingering_threads.append(thread)
    if lingering_threads:
        thread_names = ", ".join(t.name for t in lingering_threads)
        logger.warning(
            f"Detected {len(lingering_threads)} background thread(s) [{thread_names}] still running "
            "after container exit. This will prevent runner shutdown for up to 30 seconds."
        )

    logger.debug("Container: done")
