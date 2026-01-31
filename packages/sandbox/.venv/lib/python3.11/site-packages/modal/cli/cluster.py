# Copyright Modal Labs 2022
from typing import Optional, Union

import typer
from rich.table import Column
from rich.text import Text

from modal._object import _get_environment_name
from modal._output import make_console
from modal._pty import get_pty_info
from modal._utils.async_utils import synchronizer
from modal._utils.time_utils import timestamp_to_localized_str
from modal.cli.utils import ENV_OPTION, display_table, is_tty
from modal.client import _Client
from modal.config import config
from modal.container_process import _ContainerProcess
from modal.environments import ensure_env
from modal.stream_type import StreamType
from modal_proto import api_pb2

cluster_cli = typer.Typer(
    name="cluster", help="Manage and connect to running multi-node clusters.", no_args_is_help=True
)


@cluster_cli.command("list")
@synchronizer.create_blocking
async def list_(env: Optional[str] = ENV_OPTION, json: bool = False):
    """List all clusters that are currently running."""
    env = ensure_env(env)
    client = await _Client.from_env()
    environment_name = _get_environment_name(env)
    res: api_pb2.ClusterListResponse = await client.stub.ClusterList(
        api_pb2.ClusterListRequest(environment_name=environment_name)
    )

    column_names: list[Union[Column, str]] = [
        Column("Cluster ID", min_width=25),
        Column("App ID", min_width=25),
        "Start Time",
        "Nodes",
    ]
    rows: list[list[Union[Text, str]]] = []
    res.clusters.sort(key=lambda c: c.started_at, reverse=True)

    for c in res.clusters:
        rows.append(
            [
                c.cluster_id,
                c.app_id,
                timestamp_to_localized_str(c.started_at, json) if c.started_at else "Pending",
                str(len(c.task_ids)),
            ]
        )

    display_table(column_names, rows, json=json, title=f"Active Multi-node Clusters in environment: {environment_name}")


@cluster_cli.command("shell")
@synchronizer.create_blocking
async def shell(
    cluster_id: str = typer.Argument(help="Cluster ID"),
    rank: int = typer.Option(default=0, help="Rank of the node to shell into"),
):
    """Open a shell to a multi-node cluster node."""
    client = await _Client.from_env()
    res: api_pb2.ClusterGetResponse = await client.stub.ClusterGet(api_pb2.ClusterGetRequest(cluster_id=cluster_id))
    if len(res.cluster.task_ids) <= rank:
        raise typer.Abort(f"No node with rank {rank} in cluster {cluster_id}")
    task_id = res.cluster.task_ids[rank]
    console = make_console()
    is_main = "(main)" if rank == 0 else ""
    console.print(
        f"Opening shell to node {rank} {is_main} of cluster {cluster_id} (container {task_id})", style="green"
    )

    pty = is_tty()
    req = api_pb2.ContainerExecRequest(
        task_id=task_id,
        command=["/bin/bash"],
        pty_info=get_pty_info(shell=True) if pty else None,
        runtime_debug=config.get("function_runtime_debug"),
    )
    exec_res: api_pb2.ContainerExecResponse = await client.stub.ContainerExec(req)
    if pty:
        await _ContainerProcess(exec_res.exec_id, task_id, client).attach()
    else:
        # TODO: redirect stderr to its own stream?
        await _ContainerProcess(
            exec_res.exec_id, task_id, client, stdout=StreamType.STDOUT, stderr=StreamType.STDOUT
        ).wait()
