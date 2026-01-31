# Copyright Modal Labs 2022
import re
from typing import Optional, Union

import rich
import typer
from click import UsageError
from rich.table import Column
from rich.text import Text
from typer import Argument

from modal._object import _get_environment_name
from modal._output import make_console
from modal._utils.async_utils import synchronizer
from modal._utils.browser_utils import open_url_and_display
from modal.client import _Client
from modal.environments import ensure_env
from modal_proto import api_pb2

from .._utils.time_utils import timestamp_to_localized_str
from .utils import ENV_OPTION, display_table, get_app_id_from_name, stream_app_logs

APP_IDENTIFIER = Argument("", help="App name or ID")
NAME_OPTION = typer.Option("", "-n", "--name", help="Deprecated: Pass App name as a positional argument")

app_cli = typer.Typer(name="app", help="Manage deployed and running apps.", no_args_is_help=True)

APP_STATE_TO_MESSAGE = {
    api_pb2.APP_STATE_DEPLOYED: Text("deployed", style="green"),
    api_pb2.APP_STATE_DETACHED: Text("ephemeral (detached)", style="green"),
    api_pb2.APP_STATE_DETACHED_DISCONNECTED: Text("ephemeral (detached)", style="green"),
    api_pb2.APP_STATE_DISABLED: Text("disabled", style="dim"),
    api_pb2.APP_STATE_EPHEMERAL: Text("ephemeral", style="green"),
    api_pb2.APP_STATE_INITIALIZING: Text("initializing...", style="yellow"),
    api_pb2.APP_STATE_STOPPED: Text("stopped", style="blue"),
    api_pb2.APP_STATE_STOPPING: Text("stopping...", style="blue"),
}


@synchronizer.create_blocking
async def get_app_id(app_identifier: str, env: Optional[str], client: Optional[_Client] = None) -> str:
    """Resolve an app_identifier that may be a name or an ID into an ID."""
    if re.match(r"^ap-[a-zA-Z0-9]{22}$", app_identifier):
        return app_identifier
    return await get_app_id_from_name.aio(app_identifier, env, client)


@app_cli.command("list")
@synchronizer.create_blocking
async def list_(env: Optional[str] = ENV_OPTION, json: bool = False):
    """List Modal apps that are currently deployed/running or recently stopped."""
    env = ensure_env(env)
    client = await _Client.from_env()

    resp: api_pb2.AppListResponse = await client.stub.AppList(
        api_pb2.AppListRequest(environment_name=_get_environment_name(env))
    )

    columns: list[Union[Column, str]] = [
        Column("App ID", min_width=25),  # Ensure that App ID is not truncated in slim terminals
        "Description",
        "State",
        "Tasks",
        "Created at",
        "Stopped at",
    ]
    rows: list[list[Union[Text, str]]] = []
    for app_stats in resp.apps:
        state = APP_STATE_TO_MESSAGE.get(app_stats.state, Text("unknown", style="gray"))
        rows.append(
            [
                app_stats.app_id,
                app_stats.description,
                state,
                str(app_stats.n_running_tasks),
                timestamp_to_localized_str(app_stats.created_at, json),
                timestamp_to_localized_str(app_stats.stopped_at, json),
            ]
        )

    env_part = f" in environment '{env}'" if env else ""
    display_table(columns, rows, json, title=f"Apps{env_part}")


@app_cli.command("logs", no_args_is_help=True)
def logs(
    app_identifier: str = APP_IDENTIFIER,
    *,
    env: Optional[str] = ENV_OPTION,
    timestamps: bool = typer.Option(False, "--timestamps", help="Show timestamps for each log line"),
):
    """Show App logs, streaming while active.

    **Examples:**

    Get the logs based on an app ID:

    ```
    modal app logs ap-123456
    ```

    Get the logs for a currently deployed App based on its name:

    ```
    modal app logs my-app
    ```

    """
    app_id = get_app_id(app_identifier, env)
    stream_app_logs(app_id, show_timestamps=timestamps)


@app_cli.command("rollback", no_args_is_help=True, context_settings={"ignore_unknown_options": True})
@synchronizer.create_blocking
async def rollback(
    app_identifier: str = APP_IDENTIFIER,
    version: str = typer.Argument("", help="Target version for rollback."),
    *,
    env: Optional[str] = ENV_OPTION,
):
    """Redeploy a previous version of an App.

    Note that the App must currently be in a "deployed" state.
    Rollbacks will appear as a new deployment in the App history, although
    the App state will be reset to the state at the time of the previous deployment.

    **Examples:**

    Rollback an App to its previous version:

    ```
    modal app rollback my-app
    ```

    Rollback an App to a specific version:

    ```
    modal app rollback my-app v3
    ```

    Rollback an App using its App ID instead of its name:

    ```
    modal app rollback ap-abcdefghABCDEFGH123456
    ```

    """
    env = ensure_env(env)
    client = await _Client.from_env()
    app_id = await get_app_id.aio(app_identifier, env, client)
    if not version:
        version_number = -1
    else:
        if m := re.match(r"v(\d+)", version):
            version_number = int(m.group(1))
        else:
            raise UsageError(f"Invalid version specifer: {version}")
    req = api_pb2.AppRollbackRequest(app_id=app_id, version=version_number)
    await client.stub.AppRollback(req)
    rich.print("[green]✓[/green] Deployment rollback successful!")


@app_cli.command("stop", no_args_is_help=True)
@synchronizer.create_blocking
async def stop(
    app_identifier: str = APP_IDENTIFIER,
    *,
    env: Optional[str] = ENV_OPTION,
):
    """Stop an app."""
    client = await _Client.from_env()
    app_id = await get_app_id.aio(app_identifier, env)
    req = api_pb2.AppStopRequest(app_id=app_id, source=api_pb2.APP_STOP_SOURCE_CLI)
    await client.stub.AppStop(req)


@app_cli.command("history", no_args_is_help=True)
@synchronizer.create_blocking
async def history(
    app_identifier: str = APP_IDENTIFIER,
    *,
    env: Optional[str] = ENV_OPTION,
    json: bool = False,
):
    """Show App deployment history, for a currently deployed app

    **Examples:**

    Get the history based on an app ID:

    ```
    modal app history ap-123456
    ```

    Get the history for a currently deployed App based on its name:

    ```
    modal app history my-app
    ```

    """
    env = ensure_env(env)
    client = await _Client.from_env()
    app_id = await get_app_id.aio(app_identifier, env, client)
    resp = await client.stub.AppDeploymentHistory(api_pb2.AppDeploymentHistoryRequest(app_id=app_id))

    columns = [
        "Version",
        "Time deployed",
        "Client",
        "Deployed by",
        "Commit",
        "Tag",
    ]
    rows = []
    deployments_with_dirty_commit = False
    for idx, app_stats in enumerate(resp.app_deployment_histories):
        style = "bold green" if idx == 0 else ""

        row = [
            Text(f"v{app_stats.version}", style=style),
            Text(timestamp_to_localized_str(app_stats.deployed_at, json), style=style),
            Text(app_stats.client_version, style=style),
            Text(app_stats.deployed_by, style=style),
        ]

        if app_stats.commit_info.commit_hash:
            short_hash = app_stats.commit_info.commit_hash[:7]
            if app_stats.commit_info.dirty:
                deployments_with_dirty_commit = True
                short_hash = f"{short_hash}*"
            row.append(Text(short_hash, style=style))
        else:
            row.append(None)

        if app_stats.tag:
            row.append(Text(app_stats.tag, style=style))
        else:
            row.append(None)

        rows.append(row)

    # Suppress tag information when no deployments used one
    if not any(row[-1] for row in rows):
        rows = [row[:-1] for row in rows]
        columns = columns[:-1]

    rows = sorted(rows, key=lambda x: int(str(x[0])[1:]), reverse=True)
    display_table(columns, rows, json)

    if deployments_with_dirty_commit and not json:
        rich.print("* - repo had uncommitted changes")


@app_cli.command("dashboard", no_args_is_help=True)
@synchronizer.create_blocking
async def dashboard(
    app_identifier: str = APP_IDENTIFIER,
    *,
    env: Optional[str] = ENV_OPTION,
):
    """Open an App's dashboard page in your web browser.

    **Examples:**

    Open dashboard for an app by name:

    ```
    modal app dashboard my-app
    ```

    Use a specified environment:

    ```
    modal app dashboard my-app --env dev
    ```
    """
    client = await _Client.from_env()
    app_id = await get_app_id.aio(app_identifier, env, client)

    console = make_console()
    url = f"https://modal.com/id/{app_id}"

    open_url_and_display(url, "App dashboard", console)
