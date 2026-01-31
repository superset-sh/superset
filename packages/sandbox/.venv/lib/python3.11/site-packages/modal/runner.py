# Copyright Modal Labs 2025
"""Internal module for building and running Apps."""
# Note: While this is mostly internal code, the `modal.runner.deploy_app` function was
# the only way to programmatically deploy Apps for some time, so users have reached into here.
# We may eventually deprecate it from the public API, but for now we should keep that in mind.

import asyncio
import dataclasses
import os
import time
from collections.abc import AsyncGenerator
from contextlib import nullcontext
from multiprocessing.synchronize import Event
from typing import TYPE_CHECKING, Any, Optional, TypeVar

from synchronicity.async_wrap import asynccontextmanager

import modal._runtime.execution_context
import modal_proto.api_pb2
from modal._load_context import LoadContext
from modal._utils.grpc_utils import Retry
from modal_proto import api_pb2

from ._functions import _Function
from ._object import _get_environment_name, _Object
from ._pty import get_pty_info
from ._resolver import Resolver
from ._traceback import print_server_warnings, traceback_contains_remote_call
from ._utils.async_utils import TaskContext, gather_cancel_on_exc, synchronize_api
from ._utils.deprecation import warn_if_passing_namespace
from ._utils.git_utils import get_git_commit_info
from ._utils.name_utils import check_object_name, is_valid_tag
from .client import HEARTBEAT_INTERVAL, HEARTBEAT_TIMEOUT, _Client
from .cls import _Cls
from .config import config, logger
from .environments import _get_environment_cached
from .exception import ConnectionError, InteractiveTimeoutError, InvalidError, RemoteError, _CliUserExecutionError
from .output import _get_output_manager, enable_output
from .running_app import RunningApp, running_app_from_layout
from .sandbox import _Sandbox
from .secret import _Secret
from .stream_type import StreamType

if TYPE_CHECKING:
    import modal.app


V = TypeVar("V")


async def _heartbeat(client: _Client, app_id: str) -> None:
    request = api_pb2.AppHeartbeatRequest(app_id=app_id)
    # TODO(erikbern): we should capture exceptions here
    # * if request fails: destroy the client
    # * if server says the app is gone: print a helpful warning about detaching
    await client.stub.AppHeartbeat(request, retry=Retry(attempt_timeout=HEARTBEAT_TIMEOUT))


async def _init_local_app_existing(client: _Client, existing_app_id: str, environment_name: str) -> RunningApp:
    # Get all the objects first
    obj_req = api_pb2.AppGetLayoutRequest(app_id=existing_app_id)
    obj_resp, _ = await gather_cancel_on_exc(
        client.stub.AppGetLayout(obj_req),
        # Cache the environment associated with the app now as we will use it later
        _get_environment_cached(environment_name, client),
    )
    app_page_url = f"https://modal.com/apps/{existing_app_id}"  # TODO (elias): this should come from the backend
    return running_app_from_layout(
        existing_app_id,
        obj_resp.app_layout,
        app_page_url=app_page_url,
    )


async def _init_local_app_new(
    client: _Client,
    description: str,
    tags: dict[str, str],
    app_state: int,  # ValueType
    environment_name: str = "",
    interactive: bool = False,
) -> RunningApp:
    app_req = api_pb2.AppCreateRequest(
        description=description,
        environment_name=environment_name,
        app_state=app_state,  # type: ignore
        tags=tags,
    )
    app_resp, _ = await gather_cancel_on_exc(  # TODO: use TaskGroup?
        client.stub.AppCreate(app_req),
        # Cache the environment associated with the app now as we will use it later
        _get_environment_cached(environment_name, client),
    )
    logger.debug(f"Created new app with id {app_resp.app_id}")
    return RunningApp(
        app_resp.app_id,
        app_page_url=app_resp.app_page_url,
        app_logs_url=app_resp.app_logs_url,
        interactive=interactive,
    )


async def _init_local_app_from_name(
    client: _Client,
    name: str,
    tags: dict[str, str],
    environment_name: str = "",
) -> RunningApp:
    # Look up any existing deployment
    app_req = api_pb2.AppGetByDeploymentNameRequest(
        name=name,
        environment_name=environment_name,
    )
    app_resp = await client.stub.AppGetByDeploymentName(app_req)
    existing_app_id = app_resp.app_id or None

    # Grab the app
    if existing_app_id is not None:
        return await _init_local_app_existing(client, existing_app_id, environment_name)
    else:
        return await _init_local_app_new(
            client, name, tags, api_pb2.APP_STATE_INITIALIZING, environment_name=environment_name
        )


async def _create_all_objects(
    running_app: RunningApp,
    local_app_state: "modal.app._LocalAppState",
    load_context: LoadContext,
) -> None:
    """Create objects that have been defined but not created on the server.

    The load_context must have a task_context set for proper exception handling
    when loading shared dependencies.
    """
    indexed_objects: dict[str, _Object] = {**local_app_state.functions, **local_app_state.classes}
    tc = load_context.task_context

    resolver = Resolver()
    with resolver.display():
        # Get current objects, and reset all objects
        tag_to_object_id = {**running_app.function_ids, **running_app.class_ids}
        running_app.function_ids = {}
        running_app.class_ids = {}

        # Assign all objects
        for tag, obj in indexed_objects.items():
            # Reset object_id in case the app runs twice
            # TODO(erikbern): clean up the interface
            obj._unhydrate()

        # Preload all functions to make sure they have ids assigned before they are loaded.
        # This is important to make sure any enclosed function handle references in serialized
        # functions have ids assigned to them when the function is serialized.
        # Note: when handles/objs are merged, all objects will need to get ids pre-assigned
        # like this in order to be referrable within serialized functions
        async def _preload(tag, obj):
            existing_object_id = tag_to_object_id.get(tag)
            # Note: preload only currently implemented for Functions, returns None otherwise
            # this is to ensure that directly referenced functions from the global scope has
            # ids associated with them when they are serialized into other functions
            if existing_object_id is not None and not obj._is_id_type(existing_object_id):
                expected_type = obj.__class__.__name__.strip("_")
                expected_prefix = getattr(obj.__class__, "_type_prefix", None)
                prefix_hint = f" (expected prefix {expected_prefix}-)" if expected_prefix else ""
                raise InvalidError(
                    f"Existing object id {existing_object_id} is not a {expected_type} id{prefix_hint}. "
                    "This usually means the object name was previously used for a different type. "
                    "Rename the object/app or stop the previous deployment and redeploy."
                )

            await resolver.preload(obj, load_context, existing_object_id)
            if obj.is_hydrated:
                tag_to_object_id[tag] = obj.object_id

        async def _load(tag, obj):
            existing_object_id = tag_to_object_id.get(tag)
            # Pass load_context so dependencies can inherit app_id, client, etc.
            await resolver.load(obj, load_context, existing_object_id=existing_object_id)
            if _Function._is_id_type(obj.object_id):
                running_app.function_ids[tag] = obj.object_id
            elif _Cls._is_id_type(obj.object_id):
                running_app.class_ids[tag] = obj.object_id
            else:
                raise RuntimeError(f"Unexpected object {obj.object_id}")

        await asyncio.gather(*[tc.create_task(_preload(tag, obj)) for tag, obj in indexed_objects.items()])
        await asyncio.gather(*[tc.create_task(_load(tag, obj)) for tag, obj in indexed_objects.items()])


async def _publish_app(
    client: _Client,
    running_app: RunningApp,
    app_state: int,  # api_pb2.AppState.value
    app_local_state: "modal.app._LocalAppState",
    name: str = "",
    deployment_tag: str = "",  # Only relevant for deployments
    commit_info: Optional[api_pb2.CommitInfo] = None,  # Git commit information
) -> tuple[str, list[api_pb2.Warning]]:
    """Wrapper for AppPublish RPC."""
    functions = app_local_state.functions
    definition_ids = {obj.object_id: obj._get_metadata().definition_id for obj in functions.values()}  # type: ignore

    request = api_pb2.AppPublishRequest(
        app_id=running_app.app_id,
        name=name,
        tags=app_local_state.tags,
        deployment_tag=deployment_tag,
        commit_info=commit_info,
        app_state=app_state,  # type: ignore  : should be a api_pb2.AppState.value
        function_ids=running_app.function_ids,
        class_ids=running_app.class_ids,
        definition_ids=definition_ids,
    )

    response = await client.stub.AppPublish(request)
    print_server_warnings(response.server_warnings)
    return response.url, response.server_warnings


async def _disconnect(
    client: _Client,
    app_id: str,
    reason: "modal_proto.api_pb2.AppDisconnectReason.ValueType",
    exc_str: str = "",
) -> None:
    """Tell the server the client has disconnected for this app. Terminates all running tasks
    for ephemeral apps."""

    if exc_str:
        exc_str = exc_str[:1000]  # Truncate to 1000 chars

    logger.debug("Sending app disconnect/stop request")
    req_disconnect = api_pb2.AppClientDisconnectRequest(app_id=app_id, reason=reason, exception=exc_str)
    await client.stub.AppClientDisconnect(req_disconnect)
    logger.debug("App disconnected")


async def _status_based_disconnect(client: _Client, app_id: str, exc_info: Optional[BaseException] = None):
    """Disconnect local session of a running app, sending relevant metadata

    exc_info: Exception if an exception caused the disconnect
    """
    if isinstance(exc_info, (KeyboardInterrupt, asyncio.CancelledError)):
        reason = api_pb2.APP_DISCONNECT_REASON_KEYBOARD_INTERRUPT
    elif exc_info is not None:
        if traceback_contains_remote_call(exc_info.__traceback__):
            reason = api_pb2.APP_DISCONNECT_REASON_REMOTE_EXCEPTION
        else:
            reason = api_pb2.APP_DISCONNECT_REASON_LOCAL_EXCEPTION
    else:
        reason = api_pb2.APP_DISCONNECT_REASON_ENTRYPOINT_COMPLETED
    if isinstance(exc_info, _CliUserExecutionError):
        exc_str = repr(exc_info.__cause__)
    elif exc_info:
        exc_str = repr(exc_info)
    else:
        exc_str = ""

    await _disconnect(client, app_id, reason, exc_str)


@asynccontextmanager
async def _run_app(
    app: "modal.app._App",
    *,
    client: Optional[_Client] = None,
    detach: bool = False,
    environment_name: Optional[str] = None,
    interactive: bool = False,
) -> AsyncGenerator["modal.app._App", None]:
    """mdmd:hidden"""
    load_context = await app._root_load_context.reset().in_place_upgrade(
        client=client, environment_name=environment_name
    )

    if modal._runtime.execution_context._is_currently_importing:
        raise InvalidError("Can not run an app in global scope within a container")

    if app._running_app:
        raise InvalidError(
            "App is already running and can't be started again.\n"
            "You should not use `app.run` or `run_app` within a Modal `local_entrypoint`"
        )

    if app.description is None:
        import __main__

        if "__file__" in dir(__main__):
            app.set_description(os.path.basename(__main__.__file__))
        else:
            # Interactive mode does not have __file__.
            # https://docs.python.org/3/library/__main__.html#import-main
            app.set_description(__main__.__name__)

    app_state = api_pb2.APP_STATE_DETACHED if detach else api_pb2.APP_STATE_EPHEMERAL

    output_mgr = _get_output_manager()
    if interactive and output_mgr is None:
        msg = "Interactive mode requires output to be enabled. (Use the the `modal.enable_output()` context manager.)"
        raise InvalidError(msg)

    local_app_state = app._local_state

    running_app: RunningApp = await _init_local_app_new(
        load_context.client,
        app.description or "",
        local_app_state.tags,
        environment_name=load_context.environment_name,
        app_state=app_state,
        interactive=interactive,
    )

    logs_timeout = config["logs_timeout"]
    async with app._set_local_app(load_context.client, running_app), TaskContext(grace=logs_timeout) as tc:
        # Inject TaskContext into load_context for proper exception handling when loading shared dependencies
        await load_context.in_place_upgrade(task_context=tc, app_id=running_app.app_id)

        # Start heartbeats loop to keep the client alive
        # we don't log heartbeat exceptions in detached mode
        # as losing the local connection will not affect the running app
        def heartbeat():
            return _heartbeat(load_context.client, running_app.app_id)

        heartbeat_loop = tc.infinite_loop(heartbeat, sleep=HEARTBEAT_INTERVAL, log_exception=not detach)
        logs_loop: Optional[asyncio.Task] = None

        if output_mgr is not None:
            # Defer import so this module is rich-safe
            # TODO(michael): The get_app_logs_loop function is itself rich-safe aside from accepting an OutputManager
            # as an argument, so with some refactoring we could avoid the need for this deferred import.
            from modal._output import get_app_logs_loop

            with output_mgr.make_live(output_mgr.step_progress("Initializing...")):
                initialized_msg = (
                    f"Initialized. [grey70]View run at [underline]{running_app.app_page_url}[/underline][/grey70]"
                )
                output_mgr.print(output_mgr.step_completed(initialized_msg))
                output_mgr.update_app_page_url(running_app.app_page_url or "ERROR:NO_APP_PAGE")

            # Start logs loop

            logs_loop = tc.create_task(get_app_logs_loop(load_context.client, output_mgr, app_id=running_app.app_id))

        try:
            # Create all members
            await _create_all_objects(running_app, local_app_state, load_context)

            # Publish the app
            await _publish_app(load_context.client, running_app, app_state, local_app_state)
        except asyncio.CancelledError as e:
            # this typically happens on sigint/ctrl-C during setup (the KeyboardInterrupt happens in the main thread)
            if output_mgr := _get_output_manager():
                output_mgr.print("Aborting app initialization...\n")

            await _status_based_disconnect(load_context.client, running_app.app_id, e)
            raise
        except BaseException as e:
            await _status_based_disconnect(load_context.client, running_app.app_id, e)
            raise

        detached_disconnect_msg = (
            "The detached App will keep running. You can track its progress on the Dashboard: "
            f"[magenta underline]{running_app.app_page_url}[/magenta underline]"
            "\n\nStream App logs:\n"
            f"[green]modal app logs {running_app.app_id}[/green]"
            "\n\nStop the App:\n"
            f"[green]modal app stop {running_app.app_id}[/green]"
        )

        try:
            # Show logs from dynamically created images.
            # TODO: better way to do this
            if output_mgr := _get_output_manager():
                output_mgr.enable_image_logs()

            # Yield to context
            if output_mgr := _get_output_manager():
                # Don't show status spinner in interactive mode to avoid interfering with breakpoints
                spinner_ctx = nullcontext() if interactive else output_mgr.show_status_spinner()
                with spinner_ctx:
                    yield app
            else:
                yield app
            # successful completion!
            heartbeat_loop.cancel()
            await _status_based_disconnect(load_context.client, running_app.app_id, exc_info=None)
        except KeyboardInterrupt as e:
            # this happens only if sigint comes in during the yield block above
            if detach:
                if output_mgr := _get_output_manager():
                    output_mgr.print(output_mgr.step_completed("Shutting down Modal client."))
                    output_mgr.print(detached_disconnect_msg)
                if logs_loop:
                    logs_loop.cancel()
                await _status_based_disconnect(load_context.client, running_app.app_id, e)
            else:
                if output_mgr := _get_output_manager():
                    output_mgr.print(
                        "Disconnecting from Modal - This will terminate your Modal app in a few seconds.\n"
                    )
                await _status_based_disconnect(load_context.client, running_app.app_id, e)
                if logs_loop:
                    try:
                        await asyncio.wait_for(logs_loop, timeout=logs_timeout)
                    except asyncio.TimeoutError:
                        logger.warning("Timed out waiting for final app logs.")

                if output_mgr:
                    output_mgr.print(
                        output_mgr.step_completed(
                            "App aborted. "
                            f"[grey70]View run at [underline]{running_app.app_page_url}[/underline][/grey70]"
                        )
                    )
            return
        except ConnectionError as e:
            # If we lose connection to the server after a detached App has started running, it will continue
            # I think we can only exit "nicely" if we are able to print output though, otherwise we should raise
            if detach and (output_mgr := _get_output_manager()):
                output_mgr.print(":white_exclamation_mark: Connection lost!")
                output_mgr.print(detached_disconnect_msg)
                return
            raise
        except BaseException as e:
            logger.info("Exception during app run")
            await _status_based_disconnect(load_context.client, running_app.app_id, e)
            raise

        # wait for logs gracefully, even though the task context would do the same
        # this allows us to log a more specific warning in case the app doesn't
        # provide all logs before exit
        if logs_loop:
            try:
                await asyncio.wait_for(logs_loop, timeout=logs_timeout)
            except asyncio.TimeoutError:
                logger.warning("Timed out waiting for final app logs.")

    if output_mgr := _get_output_manager():
        output_mgr.print(
            output_mgr.step_completed(
                f"App completed. [grey70]View run at [underline]{running_app.app_page_url}[/underline][/grey70]"
            )
        )


async def _serve_update(
    app: "modal.app._App",
    existing_app_id: str,
    is_ready: Event,
    environment_name: str,
) -> None:
    """mdmd:hidden"""
    # Used by child process to reinitialize a served app
    load_context = await app._root_load_context.reset().in_place_upgrade(environment_name=environment_name)
    try:
        running_app: RunningApp = await _init_local_app_existing(load_context.client, existing_app_id, environment_name)
        local_app_state = app._local_state

        # Create objects with a TaskContext for proper exception handling
        async with TaskContext() as tc:
            await load_context.in_place_upgrade(task_context=tc, app_id=running_app.app_id)
            await _create_all_objects(running_app, local_app_state, load_context)

        # Publish the updated app
        await _publish_app(
            load_context.client,
            running_app,
            app_state=api_pb2.APP_STATE_UNSPECIFIED,
            app_local_state=local_app_state,
        )

        # Communicate to the parent process
        is_ready.set()
    except asyncio.exceptions.CancelledError:
        # Stopped by parent process
        pass


@dataclasses.dataclass(frozen=True)
class DeployResult:
    """Dataclass representing the result of deploying an app."""

    app_id: str
    app_page_url: str
    app_logs_url: str
    warnings: list[str]


async def _deploy_app(
    app: "modal.app._App",
    name: Optional[str] = None,
    namespace: Any = None,  # mdmd:line-hidden
    client: Optional[_Client] = None,
    environment_name: Optional[str] = None,
    tag: str = "",
) -> DeployResult:
    """Internal function for deploying an App.

    Users should prefer the `modal deploy` CLI or the `App.deploy` method.
    """
    warn_if_passing_namespace(namespace, "modal.runner.deploy_app")

    name = name or app.name or ""
    if not name:
        raise InvalidError(
            "You need to either supply a deployment name or have a name set on the app.\n"
            "\n"
            "Examples:\n"
            'modal.runner.deploy_app(app, name="some_name")\n\n'
            "or\n"
            'app = modal.App("some-name")'
        )
    else:
        check_object_name(name, "App")

    if tag and not is_valid_tag(tag, max_length=50):
        raise InvalidError(
            f"Deployment tag {tag!r} is invalid."
            "\n\nTags may only contain alphanumeric characters, dashes, periods, and underscores, "
            "and must be 50 characters or less"
        )

    if client is None:
        client = await _Client.from_env()

    local_app_state = app._local_state
    t0 = time.time()

    # Get git information to track deployment history
    commit_info_task = asyncio.create_task(get_git_commit_info())

    # We need to do in-place replacement of fields in self._root_load_context in case it has already "spread"
    # to with_options() instances or similar before load
    root_load_context = await app._root_load_context.reset().in_place_upgrade(
        client=client,
        environment_name=environment_name,
    )
    running_app: RunningApp = await _init_local_app_from_name(
        root_load_context.client, name, local_app_state.tags, environment_name=root_load_context.environment_name
    )

    async with TaskContext(0) as tc:
        # Inject TaskContext into load_context for proper exception handling when loading shared dependencies
        await root_load_context.in_place_upgrade(task_context=tc, app_id=running_app.app_id)

        # Start heartbeats loop to keep the client alive
        def heartbeat():
            return _heartbeat(client, running_app.app_id)

        tc.infinite_loop(heartbeat, sleep=HEARTBEAT_INTERVAL)

        try:
            # Create all members
            await _create_all_objects(running_app, local_app_state, root_load_context)

            commit_info = None
            try:
                commit_info = await commit_info_task
            except Exception as e:
                logger.debug("Failed to get git commit info", exc_info=e)

            app_url, warnings = await _publish_app(
                client,
                running_app,
                api_pb2.APP_STATE_DEPLOYED,
                local_app_state,
                name=name,
                deployment_tag=tag,
                commit_info=commit_info,
            )
        except Exception as e:
            # Note that AppClientDisconnect only stops the app if it's still initializing, and is a no-op otherwise.
            await _disconnect(client, running_app.app_id, reason=api_pb2.APP_DISCONNECT_REASON_DEPLOYMENT_EXCEPTION)
            raise e

    if output_mgr := _get_output_manager():
        t = time.time() - t0
        output_mgr.print(output_mgr.step_completed(f"App deployed in {t:.3f}s! 🎉"))
        output_mgr.print(f"\nView Deployment: [magenta]{app_url}[/magenta]")
    return DeployResult(
        app_id=running_app.app_id,
        app_page_url=running_app.app_page_url,
        app_logs_url=running_app.app_logs_url,  # type: ignore
        warnings=[warning.message for warning in warnings],
    )


async def _interactive_shell(
    _app: "modal.app._App", cmds: list[str], environment_name: str = "", pty: bool = True, **kwargs: Any
) -> None:
    """Run an interactive shell (like `bash`) within the image for this app.

    This is useful for online debugging and interactive exploration of the
    contents of this image. If `cmd` is optionally provided, it will be run
    instead of the default shell inside this image.

    **Example**

    ```python
    import modal

    app = modal.App(image=modal.Image.debian_slim().apt_install("vim"))
    ```

    You can now run this using

    ```
    modal shell script.py --cmd /bin/bash
    ```

    When calling programmatically, `kwargs` are passed to `Sandbox.create()`.
    """

    client = await _Client.from_env()
    async with _run_app(_app, client=client, environment_name=environment_name):
        sandbox_cmds = cmds if len(cmds) > 0 else ["/bin/bash"]
        sandbox_env = {
            "MODAL_TOKEN_ID": config["token_id"],
            "MODAL_TOKEN_SECRET": config["token_secret"],
            "MODAL_ENVIRONMENT": _get_environment_name(),
        }
        secrets = kwargs.pop("secrets", []) + [_Secret.from_dict(sandbox_env)]

        with enable_output():  # show any image build logs
            sandbox = await _Sandbox._create(
                "sleep",
                "100000",
                app=_app,
                secrets=secrets,
                **kwargs,
            )

        try:
            if pty:
                container_process = await sandbox._exec(
                    *sandbox_cmds, pty_info=get_pty_info(shell=True) if pty else None, text=False
                )
                await container_process.attach()
            else:
                container_process = await sandbox._exec(
                    *sandbox_cmds, stdout=StreamType.STDOUT, stderr=StreamType.STDOUT
                )
                await container_process.wait()
        except InteractiveTimeoutError:
            # Check on status of Sandbox. It may have crashed, causing connection failure.
            req = api_pb2.SandboxWaitRequest(sandbox_id=sandbox._object_id, timeout=0)
            resp = await sandbox._client.stub.SandboxWait(req)
            if resp.result.exception:
                raise RemoteError(resp.result.exception)
            else:
                raise


run_app = synchronize_api(_run_app)
serve_update = synchronize_api(_serve_update)
deploy_app = synchronize_api(_deploy_app)
interactive_shell = synchronize_api(_interactive_shell)
