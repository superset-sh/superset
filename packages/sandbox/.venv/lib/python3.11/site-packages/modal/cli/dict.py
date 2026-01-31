# Copyright Modal Labs 2024
from typing import Optional

import typer
from typer import Argument, Option, Typer

from modal._load_context import LoadContext
from modal._output import make_console
from modal._resolver import Resolver
from modal._utils.async_utils import TaskContext, synchronizer
from modal._utils.time_utils import timestamp_to_localized_str
from modal.cli.utils import ENV_OPTION, YES_OPTION, display_table
from modal.client import _Client
from modal.dict import _Dict
from modal.environments import ensure_env

dict_cli = Typer(
    name="dict",
    no_args_is_help=True,
    help="Manage `modal.Dict` objects and inspect their contents.",
)


@dict_cli.command(name="create", rich_help_panel="Management")
@synchronizer.create_blocking
async def create(name: str, *, env: Optional[str] = ENV_OPTION):
    """Create a named Dict object.

    Note: This is a no-op when the Dict already exists.
    """
    d = _Dict.from_name(name, environment_name=env, create_if_missing=True)
    client = await _Client.from_env()
    resolver = Resolver()

    async with TaskContext() as tc:
        load_context = LoadContext(client=client, environment_name=env, task_context=tc)
        await resolver.load(d, load_context)


@dict_cli.command(name="list", rich_help_panel="Management")
@synchronizer.create_blocking
async def list_(*, json: bool = False, env: Optional[str] = ENV_OPTION):
    """List all named Dicts."""
    env = ensure_env(env)
    dicts = await _Dict.objects.list(environment_name=env)
    rows = []
    for obj in dicts:
        info = await obj.info()
        rows.append((info.name, timestamp_to_localized_str(info.created_at.timestamp(), json), info.created_by))

    display_table(["Name", "Created at", "Created by"], rows, json)


@dict_cli.command("clear", rich_help_panel="Management")
@synchronizer.create_blocking
async def clear(name: str, *, yes: bool = YES_OPTION, env: Optional[str] = ENV_OPTION):
    """Clear the contents of a named Dict by deleting all of its data."""
    d = _Dict.from_name(name, environment_name=env)
    if not yes:
        typer.confirm(
            f"Are you sure you want to irrevocably delete the contents of modal.Dict '{name}'?",
            default=False,
            abort=True,
        )
    await d.clear()


@dict_cli.command(name="delete", rich_help_panel="Management")
@synchronizer.create_blocking
async def delete(
    name: str,
    *,
    allow_missing: bool = Option(False, "--allow-missing", help="Don't error if the Dict doesn't exist."),
    yes: bool = YES_OPTION,
    env: Optional[str] = ENV_OPTION,
):
    """Delete a named Dict and all of its data."""
    if not yes:
        typer.confirm(
            f"Are you sure you want to irrevocably delete the modal.Dict '{name}'?",
            default=False,
            abort=True,
        )
    await _Dict.objects.delete(name, environment_name=env, allow_missing=allow_missing)


@dict_cli.command(name="get", rich_help_panel="Inspection")
@synchronizer.create_blocking
async def get(name: str, key: str, *, env: Optional[str] = ENV_OPTION):
    """Print the value for a specific key.

    Note: When using the CLI, keys are always interpreted as having a string type.
    """
    d = _Dict.from_name(name, environment_name=env)
    console = make_console()
    val = await d.get(key)
    console.print(val)


def _display(input: str, use_repr: bool) -> str:
    val = repr(input) if use_repr else str(input)
    return val[:80] + "..." if len(val) > 80 else val


@dict_cli.command(name="items", rich_help_panel="Inspection")
@synchronizer.create_blocking
async def items(
    name: str,
    n: int = Argument(default=20, help="Limit the number of entries shown"),
    *,
    all: bool = Option(False, "-a", "--all", help="Ignore N and print all entries in the Dict (may be slow)"),
    use_repr: bool = Option(False, "-r", "--repr", help="Display items using `repr()` to see more details"),
    json: bool = False,
    env: Optional[str] = ENV_OPTION,
):
    """Print the contents of a Dict.

    Note: By default, this command truncates the contents. Use the `N` argument to control the
    amount of data shown or the `--all` option to retrieve the entire Dict, which may be slow.
    """
    d = _Dict.from_name(name, environment_name=env)

    i, items = 0, []
    async for key, val in d.items():
        i += 1
        if not json and not all and i > n:
            items.append(("...", "..."))
            break
        else:
            if json:
                display_item = key, val
            else:
                display_item = _display(key, use_repr), _display(val, use_repr)  # type: ignore  # mypy/issue/12056
            items.append(display_item)

    display_table(["Key", "Value"], items, json)
