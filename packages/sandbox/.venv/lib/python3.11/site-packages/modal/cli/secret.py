# Copyright Modal Labs 2022
import json
import os
import platform
import subprocess
from datetime import datetime
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Optional

import click
import typer
from rich.syntax import Syntax
from typer import Argument, Option

from modal._output import make_console
from modal._utils.async_utils import synchronizer
from modal._utils.time_utils import timestamp_to_localized_str
from modal.cli.utils import ENV_OPTION, YES_OPTION, display_table
from modal.client import _Client
from modal.environments import ensure_env
from modal.secret import _Secret
from modal_proto import api_pb2

secret_cli = typer.Typer(name="secret", help="Manage secrets.", no_args_is_help=True)


@secret_cli.command("list", help="List your published secrets.")
@synchronizer.create_blocking
async def list_(env: Optional[str] = ENV_OPTION, json: bool = False):
    env = ensure_env(env)
    client = await _Client.from_env()

    items: list[api_pb2.SecretListItem] = []

    # Note that we need to continue using the gRPC API directly here rather than using Secret.objects.list.
    # There is some metadata that historically appears in the CLI output (last_used_at) that
    # doesn't make sense to transmit as hydration metadata, because the value can change over time and
    # the metadata retrieved at hydration time could get stale. Alternatively, we could rewrite this using
    # only public API by sequentially retrieving the secrets and then querying their dynamic metadata, but
    # that would require multiple round trips and would add lag to the CLI.
    async def retrieve_page(created_before: float) -> bool:
        max_page_size = 100
        pagination = api_pb2.ListPagination(max_objects=max_page_size, created_before=created_before)
        req = api_pb2.SecretListRequest(environment_name=env, pagination=pagination)
        resp = await client.stub.SecretList(req)
        items.extend(resp.items)
        return len(resp.items) < max_page_size

    finished = await retrieve_page(datetime.now().timestamp())
    while True:
        if finished:
            break
        finished = await retrieve_page(items[-1].metadata.creation_info.created_at)

    secrets = [_Secret._new_hydrated(item.secret_id, client, item.metadata, is_another_app=True) for item in items]

    rows = []
    for obj, resp_data in zip(secrets, items):
        info = await obj.info()
        rows.append(
            [
                obj.name,
                timestamp_to_localized_str(info.created_at.timestamp(), json),
                info.created_by,
                timestamp_to_localized_str(resp_data.last_used_at, json) if resp_data.last_used_at else "-",
            ]
        )

    env_part = f" in environment '{env}'" if env else ""
    column_names = ["Name", "Created at", "Created by", "Last used at"]
    display_table(column_names, rows, json, title=f"Secrets{env_part}")


@secret_cli.command("create", help="Create a new secret.")
@synchronizer.create_blocking
async def create(
    secret_name: str,
    keyvalues: Optional[list[str]] = typer.Argument(default=None, help="Space-separated KEY=VALUE items."),
    env: Optional[str] = ENV_OPTION,
    from_dotenv: Optional[Path] = typer.Option(default=None, help="Path to a .env file to load secrets from."),
    from_json: Optional[Path] = typer.Option(default=None, help="Path to a JSON file to load secrets from."),
    force: bool = typer.Option(False, "--force", help="Overwrite the secret if it already exists."),
):
    env = ensure_env(env)
    env_dict = {}

    for arg in keyvalues or []:
        if "=" in arg:
            key, value = arg.split("=", 1)
            if value == "-":
                value = get_text_from_editor(key)
            env_dict[key] = value
        else:
            raise click.UsageError(
                """Each item should be of the form <KEY>=VALUE. To enter secrets using your $EDITOR, use `<KEY>=-`. To
enter secrets from environment variables, use `<KEY>="$ENV_VAR"`.

E.g.

modal secret create my-credentials username=john password=-
modal secret create my-credentials username=john password="$PASSWORD"
"""
            )

    if from_dotenv:
        if not from_dotenv.is_file():
            raise click.UsageError(f"Could not read .env file at {from_dotenv}")

        try:
            from dotenv import dotenv_values
        except ImportError:
            raise ImportError(
                "Need the `python-dotenv` package installed. You can install it by running `pip install python-dotenv`."
            )

        try:
            env_dict.update(dotenv_values(from_dotenv))
        except Exception as e:
            raise click.UsageError(f"Could not parse .env file at {from_dotenv}: {e}")

    if from_json:
        if not from_json.is_file():
            raise click.UsageError(f"Could not read JSON file at {from_json}")

        try:
            with from_json.open("r") as f:
                env_dict.update(json.load(f))
        except Exception as e:
            raise click.UsageError(f"Could not parse JSON file at {from_json}: {e}")

    if not env_dict:
        raise click.UsageError("You need to specify at least one key for your secret")

    for k, v in env_dict.items():
        if not isinstance(k, str) or not k:
            raise click.UsageError(f"Invalid key: '{k}'")
        if not isinstance(v, str):
            raise click.UsageError(f"Non-string value for secret '{k}'")

    # Create secret
    if force:
        # TODO migrate this path once we support Secret.update()?
        await _Secret._create_deployed(secret_name, env_dict, overwrite=force)
    else:
        await _Secret.objects.create(secret_name, env_dict)

    # Print code sample
    console = make_console()
    env_var_code = "\n    ".join(f'os.getenv("{name}")' for name in env_dict.keys()) if env_dict else "..."
    example_code = f"""
@app.function(secrets=[modal.Secret.from_name("{secret_name}")])
def some_function():
    {env_var_code}
"""
    plural_s = "s" if len(env_dict) > 1 else ""
    console.print(
        f"""Created a new secret '{secret_name}' with the key{plural_s} {", ".join(repr(k) for k in env_dict.keys())}"""
    )
    console.print("\nUse it in your Modal app:\n")
    console.print(Syntax(example_code, "python"))


@secret_cli.command("delete", help="Delete a named Secret.")
@synchronizer.create_blocking
async def delete(
    name: str = Argument(help="Name of the modal.Secret to be deleted. Case sensitive"),
    *,
    allow_missing: bool = Option(False, "--allow-missing", help="Don't error if the Secret doesn't exist."),
    yes: bool = YES_OPTION,
    env: Optional[str] = ENV_OPTION,
):
    env = ensure_env(env)
    if not yes:
        typer.confirm(
            f"Are you sure you want to irrevocably delete the modal.Secret '{name}'?",
            default=False,
            abort=True,
        )
    await _Secret.objects.delete(name, environment_name=env, allow_missing=allow_missing)


def get_text_from_editor(key) -> str:
    with NamedTemporaryFile("w+", prefix="secret_buffer", suffix=".txt") as bufferfile:
        if platform.system() != "Windows":
            editor = os.getenv("EDITOR", "vi")
            input(f"Pressing enter will open an external editor ({editor}) for editing '{key}'...")
            status_code = subprocess.call([editor, bufferfile.name])
        else:
            # not tested, but according to https://stackoverflow.com/questions/1442841/lauch-default-editor-like-webbrowser-module
            # this should open an editor on Windows...
            input("Pressing enter will open an external editor to allow you to edit the secret value...")
            status_code = os.system(bufferfile.name)

        if status_code != 0:
            raise ValueError(
                "Something went wrong with the external editor. "
                "Try again, or use '--' as the value to pass input through stdin instead"
            )

        bufferfile.seek(0)
        return bufferfile.read()
