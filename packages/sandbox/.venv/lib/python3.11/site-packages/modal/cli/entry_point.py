# Copyright Modal Labs 2022
import subprocess
from typing import Optional

import typer
from rich.rule import Rule

from modal._output import make_console
from modal._utils.async_utils import synchronizer

from . import run, shell as shell_module
from .app import app_cli
from .cluster import cluster_cli
from .config import config_cli
from .container import container_cli
from .dashboard import dashboard
from .dict import dict_cli
from .environment import environment_cli
from .launch import launch_cli
from .network_file_system import nfs_cli
from .profile import profile_cli
from .queues import queue_cli
from .secret import secret_cli
from .token import _new_token, token_cli
from .volume import volume_cli


def version_callback(value: bool):
    if value:
        from modal_version import __version__

        typer.echo(f"modal client version: {__version__}")
        raise typer.Exit()


entrypoint_cli_typer = typer.Typer(
    no_args_is_help=False,
    add_completion=False,
    rich_markup_mode="markdown",
    context_settings={"help_option_names": ["-h", "--help"]},
    help="""
    Modal is the fastest way to run code in the cloud.

    See the website at https://modal.com/ for documentation and more information
    about running code on Modal.
    """,
)


@entrypoint_cli_typer.callback(invoke_without_command=True)
def modal(
    ctx: typer.Context,
    version: bool = typer.Option(None, "--version", callback=version_callback),
):
    # TODO: When https://github.com/fastapi/typer/pull/1240 gets shipped, then
    # - set invoke_without_command=False in the callback decorator
    # - set no_args_is_help=True in entrypoint_cli_typer
    if ctx.invoked_subcommand is None:
        console = make_console()
        console.print(ctx.get_help())
        raise typer.Exit()


def check_path():
    """Checks whether the `modal` executable is on the path and usable."""
    url = "https://modal.com/docs/guide/troubleshooting#command-not-found-errors"
    try:
        subprocess.run(["modal", "--help"], capture_output=True)
        # TODO(erikbern): check returncode?
        return
    except FileNotFoundError:
        text = (
            "[red]The `[white]modal[/white]` command was not found on your path!\n"
            "You may need to add it to your path or use `[white]python -m modal[/white]` as a workaround.[/red]\n"
        )
    except PermissionError:
        text = (
            "[red]The `[white]modal[/white]` command is not executable!\n"
            "You may need to give it permissions or use `[white]python -m modal[/white]` as a workaround.[/red]\n"
        )
    text += f"See more information here:\n\n[link={url}]{url}[/link]\n"
    console = make_console()
    console.print(text)
    console.print(Rule(style="white"))


@synchronizer.create_blocking
async def setup(profile: Optional[str] = None):
    check_path()

    art = """
           #############        #############
          ####         ##      ####         ##
         ##  ##         ##    ##  ##         ##
        ##    ##         ##  ##    ##         ##
       ##      ##         ####      ##         ##
      ##        #############        ##         ##
     ##        ##         ####        ##         ##
    ##        ##         ##  ##        ##         ##
   ##        ##         ##    ##        ##         ##
  ##        ##         ##      ##        ##         ##
 ##        ##         ##        ##        ##         ##
##        ##         ##          ##        #############
 ##      ##         ##            ##      ##         ##
  ##    ##         ##              ##    ##         ##
   ##  ##         ##                ##  ##         ##
    ####         ##                  ####         ##
     #############                    #############
"""

    console = make_console()
    console.print(art, style="green")

    # Fetch a new token (same as `modal token new` but redirect to /home once finishes)
    await _new_token(profile=profile, next_url="/home")


# Commands
entrypoint_cli_typer.command("deploy", no_args_is_help=True)(run.deploy)
entrypoint_cli_typer.command("serve", no_args_is_help=True)(run.serve)
entrypoint_cli_typer.command("shell")(shell_module.shell)
entrypoint_cli_typer.command("dashboard")(dashboard)
entrypoint_cli_typer.add_typer(launch_cli)

# Deployments
entrypoint_cli_typer.add_typer(app_cli, rich_help_panel="Deployments")
entrypoint_cli_typer.add_typer(container_cli, rich_help_panel="Deployments")
# TODO: cluster is hidden while multi-node is in beta/experimental
entrypoint_cli_typer.add_typer(cluster_cli, rich_help_panel="Deployments", hidden=True)

# Storage
entrypoint_cli_typer.add_typer(dict_cli, rich_help_panel="Storage")
entrypoint_cli_typer.add_typer(nfs_cli, rich_help_panel="Storage")
entrypoint_cli_typer.add_typer(secret_cli, rich_help_panel="Storage")
entrypoint_cli_typer.add_typer(queue_cli, rich_help_panel="Storage")
entrypoint_cli_typer.add_typer(volume_cli, rich_help_panel="Storage")

# Configuration
entrypoint_cli_typer.add_typer(config_cli, rich_help_panel="Configuration")
entrypoint_cli_typer.add_typer(environment_cli, rich_help_panel="Configuration")
entrypoint_cli_typer.add_typer(profile_cli, rich_help_panel="Configuration")
entrypoint_cli_typer.add_typer(token_cli, rich_help_panel="Configuration")

# Hide setup from help as it's redundant with modal token new, but nicer for onboarding
entrypoint_cli_typer.command("setup", help="Bootstrap Modal's configuration.", rich_help_panel="Onboarding")(setup)

# Special handling for modal run, which is more complicated
entrypoint_cli = typer.main.get_command(entrypoint_cli_typer)
entrypoint_cli.add_command(run.run, name="run")  # type: ignore
entrypoint_cli.list_commands(None)  # type: ignore

if __name__ == "__main__":
    # this module is only called from tests, otherwise the parent package __main__.py is used as the entrypoint
    entrypoint_cli()
