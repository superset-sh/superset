# Copyright Modal Labs 2022
import asyncio
from collections.abc import Sequence
from json import dumps
from typing import Optional, Union

import typer
from rich.table import Column, Table
from rich.text import Text

from modal_proto import api_pb2

from .._output import OutputManager, get_app_logs_loop, make_console
from .._utils.async_utils import synchronizer
from ..client import _Client
from ..environments import ensure_env
from ..exception import NotFoundError


@synchronizer.create_blocking
async def stream_app_logs(
    app_id: Optional[str] = None,
    task_id: Optional[str] = None,
    sandbox_id: Optional[str] = None,
    app_logs_url: Optional[str] = None,
    show_timestamps: bool = False,
):
    client = await _Client.from_env()
    display_id = app_id or task_id or sandbox_id
    output_mgr = OutputManager(status_spinner_text=f"Tailing logs for {display_id}", show_timestamps=show_timestamps)
    try:
        with output_mgr.show_status_spinner():
            await get_app_logs_loop(client, output_mgr, app_id=app_id, task_id=task_id, sandbox_id=sandbox_id)
    except asyncio.CancelledError:
        pass
    except KeyboardInterrupt:
        pass


@synchronizer.create_blocking
async def get_app_id_from_name(name: str, env: Optional[str], client: Optional[_Client] = None) -> str:
    if client is None:
        client = await _Client.from_env()
    env_name = ensure_env(env)
    request = api_pb2.AppGetByDeploymentNameRequest(name=name, environment_name=env_name)
    resp = await client.stub.AppGetByDeploymentName(request)
    if not resp.app_id:
        env_comment = f" in the '{env_name}' environment" if env_name else ""
        raise NotFoundError(f"Could not find a deployed app named '{name}'{env_comment}.")
    return resp.app_id


def _plain(text: Union[Text, str]) -> str:
    return text.plain if isinstance(text, Text) else text


def is_tty() -> bool:
    return make_console().is_terminal


def display_table(
    columns: Sequence[Union[Column, str]],
    rows: Sequence[Sequence[Union[Text, str]]],
    json: bool = False,
    title: str = "",
):
    def col_to_str(col: Union[Column, str]) -> str:
        return str(col.header) if isinstance(col, Column) else col

    console = make_console()
    if json:
        json_data = [{col_to_str(col): _plain(row[i]) for i, col in enumerate(columns)} for row in rows]
        console.print_json(dumps(json_data))
    else:
        table = Table(*columns, title=title)
        for row in rows:
            table.add_row(*row)
        console.print(table)


ENV_OPTION_HELP = """Environment to interact with.

If not specified, Modal will use the default environment of your current profile, or the `MODAL_ENVIRONMENT` variable.
Otherwise, raises an error if the workspace has multiple environments.
"""
ENV_OPTION = typer.Option(None, "-e", "--env", help=ENV_OPTION_HELP)

YES_OPTION = typer.Option(False, "-y", "--yes", help="Run without pausing for confirmation.")
