# Copyright Modal Labs 2022
import getpass
import os
from datetime import datetime
from typing import Optional

import typer

from modal._output import make_console
from modal._utils.async_utils import synchronizer
from modal.client import _Client
from modal.token_flow import _new_token, _set_token
from modal_proto import api_pb2

token_cli = typer.Typer(name="token", help="Manage tokens.", no_args_is_help=True)

profile_option = typer.Option(
    None,
    help=(
        "Modal profile to set credentials for. If unspecified "
        "(and MODAL_PROFILE environment variable is not set), "
        "uses the workspace name associated with the credentials."
    ),
)
activate_option = typer.Option(
    True,
    help="Activate the profile containing this token after creation.",
)

verify_option = typer.Option(
    True,
    help="Make a test request to verify the new credentials.",
)


@token_cli.command(name="set")
@synchronizer.create_blocking
async def set(
    token_id: Optional[str] = typer.Option(None, help="Account token ID."),
    token_secret: Optional[str] = typer.Option(None, help="Account token secret."),
    profile: Optional[str] = profile_option,
    activate: bool = activate_option,
    verify: bool = verify_option,
):
    """Set account credentials for connecting to Modal.

    If the credentials are not provided on the command line, you will be prompted to enter them.
    """
    if token_id is None:
        token_id = getpass.getpass("Token ID:")
    if token_secret is None:
        token_secret = getpass.getpass("Token secret:")
    await _set_token(token_id, token_secret, profile=profile, activate=activate, verify=verify)


@token_cli.command(name="new")
@synchronizer.create_blocking
async def new(
    profile: Optional[str] = profile_option,
    activate: bool = activate_option,
    verify: bool = verify_option,
    source: Optional[str] = None,
):
    """Create a new token by using an authenticated web session."""
    await _new_token(profile=profile, activate=activate, verify=verify, source=source)


@token_cli.command(name="info")
@synchronizer.create_blocking
async def info():
    """Display information about the token that is currently in use."""
    console = make_console()

    client = await _Client.from_env()
    req = api_pb2.TokenInfoGetRequest()
    resp = await client.stub.TokenInfoGet(req)

    env_vars = []
    if os.environ.get("MODAL_TOKEN_ID"):
        env_vars.append("MODAL_TOKEN_ID")
    if os.environ.get("MODAL_TOKEN_SECRET"):
        env_vars.append("MODAL_TOKEN_SECRET")

    if env_vars:
        env_vars_str = " and ".join(env_vars)
        plural = "s" if len(env_vars) > 1 else ""
        console.print(f"[dim](Using {env_vars_str} environment variable{plural})[/dim]")

    console.print(f"[bold]Token:[/bold] {resp.token_id}")
    if resp.token_name:
        console.print(f"[bold]Name:[/bold] {resp.token_name}")
    console.print(f"[bold]Workspace:[/bold] {resp.workspace_name} [dim]({resp.workspace_id})[/dim]")

    if resp.HasField("user_identity"):
        console.print(f"[bold]User:[/bold] {resp.user_identity.username} [dim]({resp.user_identity.user_id})[/dim]")
    elif resp.HasField("service_user_identity"):
        service = resp.service_user_identity
        console.print(f"[bold]Service User:[/bold] {service.service_user_name} [dim]({service.service_user_id})[/dim]")
        if service.HasField("created_by"):
            console.print(
                f"[bold]Created By:[/bold] {service.created_by.username} [dim]({service.created_by.user_id})[/dim]"
            )

    if resp.HasField("created_at") and resp.created_at.seconds > 0:
        created_dt = datetime.fromtimestamp(resp.created_at.seconds).astimezone()
        console.print(f"[bold]Created at:[/bold] [white]{created_dt.strftime('%Y-%m-%d %H:%M:%S %Z')}[/white]")

    if resp.HasField("expires_at") and resp.expires_at.seconds > 0:
        expires_dt = datetime.fromtimestamp(resp.expires_at.seconds).astimezone()
        console.print(f"[bold]Expires at:[/bold] [white]{expires_dt.strftime('%Y-%m-%d %H:%M:%S %Z')}[/white]")
