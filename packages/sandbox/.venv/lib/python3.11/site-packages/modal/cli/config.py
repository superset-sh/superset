# Copyright Modal Labs 2022
import json

import typer

from modal._output import make_console
from modal.config import _profile, _store_user_config, config
from modal.environments import Environment

config_cli = typer.Typer(
    name="config",
    help="""
    Manage client configuration for the current profile.

    Refer to https://modal.com/docs/reference/modal.config for a full explanation
    of what these options mean, and how to set them.
    """,
    no_args_is_help=True,
)


@config_cli.command(help="Show current configuration values (debugging command).")
def show(redact: bool = typer.Option(True, help="Redact the `token_secret` value.")):
    # This is just a test command
    config_dict = config.to_dict()
    if redact and config_dict.get("token_secret"):
        config_dict["token_secret"] = "***"

    console = make_console()
    console.print_json(json.dumps(config_dict))


SET_DEFAULT_ENV_HELP = """Set the default Modal environment for the active profile

The default environment of a profile is used when no --env flag is passed to `modal run`, `modal deploy` etc.

If no default environment is set, and there exists multiple environments in a workspace, an error will be raised
when running a command that requires an environment.
"""


@config_cli.command(help=SET_DEFAULT_ENV_HELP)
def set_environment(environment_name: str):
    # Confirm that the environment exists by looking it up
    Environment.from_name(environment_name).hydrate()
    _store_user_config({"environment": environment_name})
    typer.echo(f"New default environment for profile {_profile}: {environment_name}")


@config_cli.command(hidden=True)
def set(key: str, value: str):
    _store_user_config({key: value})
