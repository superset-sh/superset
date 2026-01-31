# Copyright Modal Labs 2022
import os
import sys
from pathlib import Path
from typing import Optional

import typer
from click import UsageError
from rich.syntax import Syntax
from rich.table import Table
from typer import Argument, Typer

import modal
from modal._location import display_location
from modal._output import OutputManager, ProgressHandler, make_console
from modal._utils.async_utils import synchronizer
from modal._utils.time_utils import timestamp_to_localized_str
from modal.cli._download import _volume_download
from modal.cli.utils import ENV_OPTION, YES_OPTION, display_table
from modal.client import _Client
from modal.environments import ensure_env
from modal.network_file_system import _NetworkFileSystem
from modal_proto import api_pb2

nfs_cli = Typer(name="nfs", help="Read and edit `modal.NetworkFileSystem` file systems.", no_args_is_help=True)


@nfs_cli.command(name="list", help="List the names of all network file systems.", rich_help_panel="Management")
@synchronizer.create_blocking
async def list_(env: Optional[str] = ENV_OPTION, json: Optional[bool] = False):
    env = ensure_env(env)

    client = await _Client.from_env()
    response = await client.stub.SharedVolumeList(api_pb2.SharedVolumeListRequest(environment_name=env))
    env_part = f" in environment '{env}'" if env else ""
    column_names = ["Name", "Location", "Created at"]
    rows = []
    for item in response.items:
        rows.append(
            [
                item.label,
                display_location(item.cloud_provider),
                timestamp_to_localized_str(item.created_at, json),
            ]
        )
    display_table(column_names, rows, json, title=f"Shared Volumes{env_part}")


def gen_usage_code(label):
    return f"""
@app.function(network_file_systems={{"/my_vol": modal.NetworkFileSystem.from_name("{label}")}})
def some_func():
    os.listdir("/my_vol")
"""


@nfs_cli.command(name="create", help="Create a named network file system.", rich_help_panel="Management")
def create(
    name: str,
    env: Optional[str] = ENV_OPTION,
):
    ensure_env(env)
    modal.NetworkFileSystem.create_deployed(name, environment_name=env)
    console = make_console()
    console.print(f"Created volume '{name}'. \n\nCode example:\n")
    usage = Syntax(gen_usage_code(name), "python")
    console.print(usage)


@nfs_cli.command(
    name="ls",
    help="List files and directories in a network file system.",
    rich_help_panel="File operations",
)
@synchronizer.create_blocking
async def ls(
    volume_name: str,
    path: str = typer.Argument(default="/"),
    env: Optional[str] = ENV_OPTION,
):
    ensure_env(env)
    volume = _NetworkFileSystem.from_name(volume_name)
    entries = await volume.listdir(path)

    if sys.stdout.isatty():
        console = make_console()
        console.print(f"Directory listing of '{path}' in '{volume_name}'")
        table = Table()

        table.add_column("filename")
        table.add_column("type")

        for entry in entries:
            filetype = "dir" if entry.type == api_pb2.FileEntry.FileType.DIRECTORY else "file"
            table.add_row(entry.path, filetype)
        console.print(table)
    else:
        for entry in entries:
            print(entry.path)  # noqa: T201


@nfs_cli.command(
    name="put",
    help="""Upload a file or directory to a network file system.

Remote parent directories will be created as needed.

Ending the REMOTE_PATH with a forward slash (/), it's assumed to be a directory and the file
will be uploaded with its current name under that directory.
""",
    rich_help_panel="File operations",
)
@synchronizer.create_blocking
async def put(
    volume_name: str,
    local_path: str,
    remote_path: str = typer.Argument(default="/"),
    env: Optional[str] = ENV_OPTION,
):
    ensure_env(env)
    volume = _NetworkFileSystem.from_name(volume_name)
    if remote_path.endswith("/"):
        remote_path = remote_path + os.path.basename(local_path)
    console = make_console()

    if Path(local_path).is_dir():
        progress_handler = ProgressHandler(type="upload", console=console)
        with progress_handler.live:
            await volume.add_local_dir(local_path, remote_path, progress_cb=progress_handler.progress)
            progress_handler.progress(complete=True)
        console.print(OutputManager.step_completed(f"Uploaded directory '{local_path}' to '{remote_path}'"))

    elif "*" in local_path:
        raise UsageError("Glob uploads are currently not supported")
    else:
        progress_handler = ProgressHandler(type="upload", console=console)
        with progress_handler.live:
            written_bytes = await volume.add_local_file(local_path, remote_path, progress_cb=progress_handler.progress)
            progress_handler.progress(complete=True)
        console.print(
            OutputManager.step_completed(
                f"Uploaded file '{local_path}' to '{remote_path}' ({written_bytes} bytes written)"
            )
        )


class CliError(Exception):
    def __init__(self, message):
        self.message = message


@nfs_cli.command(name="get", rich_help_panel="File operations")
@synchronizer.create_blocking
async def get(
    volume_name: str,
    remote_path: str,
    local_destination: str = typer.Argument("."),
    force: bool = False,
    env: Optional[str] = ENV_OPTION,
):
    """Download a file from a network file system.

    Specifying a glob pattern (using any `*` or `**` patterns) as the `remote_path` will download
    all matching files, preserving their directory structure.

    For example, to download an entire network file system into `dump_volume`:

    ```
    modal nfs get <volume-name> "**" dump_volume
    ```

    Use "-" as LOCAL_DESTINATION to write file contents to standard output.
    """
    ensure_env(env)
    destination = Path(local_destination)
    volume = _NetworkFileSystem.from_name(volume_name)
    console = make_console()
    progress_handler = ProgressHandler(type="download", console=console)
    with progress_handler.live:
        await _volume_download(volume, remote_path, destination, force, progress_cb=progress_handler.progress)
    console.print(OutputManager.step_completed("Finished downloading files to local!"))


@nfs_cli.command(
    name="rm", help="Delete a file or directory from a network file system.", rich_help_panel="File operations"
)
@synchronizer.create_blocking
async def rm(
    volume_name: str,
    remote_path: str,
    recursive: bool = typer.Option(False, "-r", "--recursive", help="Delete directory recursively"),
    env: Optional[str] = ENV_OPTION,
):
    ensure_env(env)
    volume = _NetworkFileSystem.from_name(volume_name)
    console = make_console()
    await volume.remove_file(remote_path, recursive=recursive)
    console.print(OutputManager.step_completed(f"{remote_path} was deleted successfully!"))


@nfs_cli.command(
    name="delete",
    help="Delete a named, persistent modal.NetworkFileSystem.",
    rich_help_panel="Management",
)
@synchronizer.create_blocking
async def delete(
    nfs_name: str = Argument(help="Name of the modal.NetworkFileSystem to be deleted. Case sensitive"),
    yes: bool = YES_OPTION,
    env: Optional[str] = ENV_OPTION,
):
    # Lookup first to validate the name, even though delete is a staticmethod
    await _NetworkFileSystem.from_name(nfs_name, environment_name=env).hydrate()
    if not yes:
        typer.confirm(
            f"Are you sure you want to irrevocably delete the modal.NetworkFileSystem '{nfs_name}'?",
            default=False,
            abort=True,
        )

    await _NetworkFileSystem.delete(nfs_name, environment_name=env)
