# Copyright Modal Labs 2022

import asyncio
import os
from typing import Optional

import typer
from rich.json import JSON
from rich.table import Table

from modal._output import make_console
from modal._utils.async_utils import synchronizer
from modal.config import Config, _lookup_workspace, _profile, config_profiles, config_set_active_profile
from modal.exception import AuthError

profile_cli = typer.Typer(name="profile", help="Switch between Modal profiles.", no_args_is_help=True)


@profile_cli.command(help="Change the active Modal profile.")
def activate(profile: str = typer.Argument(..., help="Modal profile to activate.")):
    config_set_active_profile(profile)
    typer.echo(f"Active profile: {profile}")


@profile_cli.command(help="Print the currently active Modal profile.")
def current():
    typer.echo(_profile)


@profile_cli.command(name="list", help="Show all Modal profiles and highlight the active one.")
@synchronizer.create_blocking
async def list_(json: Optional[bool] = False):
    config = Config()
    profiles = config_profiles()
    lookup_coros = [
        _lookup_workspace(
            config.get("server_url", profile),
            config.get("token_id", profile, use_env=False),
            config.get("token_secret", profile, use_env=False),
        )
        for profile in profiles
    ]
    responses = await asyncio.gather(*lookup_coros, return_exceptions=True)

    rows = []
    for profile, resp in zip(profiles, responses):
        active = profile == _profile
        if isinstance(resp, AuthError):
            workspace = "Unknown (authentication failure)"
        elif isinstance(resp, TimeoutError):
            workspace = "Unknown (timed out)"
        elif isinstance(resp, Exception):
            # Catch-all for other exceptions, like incorrect server url
            workspace = "Unknown (profile misconfigured)"
        else:
            assert hasattr(resp, "username")
            workspace = resp.username
        content = ["•" if active else "", profile, workspace]
        rows.append((active, content))

    env_based_workspace: Optional[str] = None
    if "MODAL_TOKEN_ID" in os.environ:
        try:
            env_based_resp = await _lookup_workspace(
                config.get("server_url", _profile),
                os.environ.get("MODAL_TOKEN_ID"),
                os.environ.get("MODAL_TOKEN_SECRET"),
            )
            env_based_workspace = env_based_resp.username
        except AuthError:
            env_based_workspace = "Unknown (authentication failure)"

    console = make_console()
    highlight = "bold green" if env_based_workspace is None else "yellow"
    if json:
        json_data = []
        for active, content in rows:
            json_data.append({"name": content[1], "workspace": content[2], "active": active})
        console.print(JSON.from_data(json_data))
    else:
        table = Table(" ", "Profile", "Workspace")
        for active, content in rows:
            table.add_row(*content, style=highlight if active else "dim")
        console.print(table)

    if env_based_workspace is not None:
        console.print(
            f"Using [bold]{env_based_workspace}[/bold] workspace based on environment variables", style="yellow"
        )
