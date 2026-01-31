# Copyright Modal Labs 2024
import os
import socket
from dataclasses import dataclass
from typing import Optional

from modal._utils.async_utils import synchronize_api
from modal.client import _Client
from modal.exception import InvalidError
from modal_proto import api_pb2


@dataclass
class ClusterInfo:
    rank: int
    cluster_id: str
    container_ips: list[str]
    container_ipv4_ips: list[str]


cluster_info: Optional[ClusterInfo] = None


def get_cluster_info() -> ClusterInfo:
    if cluster_info is None:
        raise InvalidError(
            "Cluster info not initialized. Please ensure that you are "
            "calling get_cluster_info() from a clustered function."
        )
    return cluster_info


async def _initialize_clustered_function(client: _Client, task_id: str, world_size: int):
    global cluster_info

    def get_i6pn():
        """Returns the ipv6 address assigned to this container."""
        return socket.getaddrinfo("i6pn.modal.local", None, socket.AF_INET6)[0][4][0]

    hostname = socket.gethostname()
    container_ip = get_i6pn()

    # nccl's default host ID is $(hostname)$(cat /proc/sys/kernel/random/boot_id).
    # on runc, if two i6pn-linked containers get scheduled on the same worker,
    # their boot ID and hostname will both be identical, causing nccl to break.
    # As a workaround, we can explicitly specify a unique host ID here.
    # See MOD-4067.
    os.environ["NCCL_HOSTID"] = f"{hostname}{container_ip}"

    # We found these settings to work well in most cases. You may be able to achieve
    # better performance by tuning these settings.
    if os.environ["MODAL_CLOUD_PROVIDER"] in ("CLOUD_PROVIDER_GCP", "CLOUD_PROVIDER_OCI"):
        os.environ["NCCL_SOCKET_NTHREADS"] = "4"
        os.environ["NCCL_NSOCKS_PERTHREAD"] = "1"
    elif os.environ["MODAL_CLOUD_PROVIDER"] == "CLOUD_PROVIDER_AWS":
        os.environ["NCCL_SOCKET_NTHREADS"] = "2"
        os.environ["NCCL_NSOCKS_PERTHREAD"] = "8"
    else:
        os.environ["NCCL_SOCKET_NTHREADS"] = "1"
        os.environ["NCCL_NSOCKS_PERTHREAD"] = "1"

    if world_size > 1:
        resp = await client.stub.TaskClusterHello(
            api_pb2.TaskClusterHelloRequest(
                task_id=task_id,
                container_ip=container_ip,
            ),
        )
        cluster_info = ClusterInfo(
            rank=resp.cluster_rank,
            cluster_id=resp.cluster_id,
            container_ips=resp.container_ips,
            container_ipv4_ips=resp.container_ipv4_ips,
        )
    else:
        cluster_info = ClusterInfo(
            rank=0,
            cluster_id="",  # No cluster ID for single-node  # TODO(irfansharif): Is this right?
            container_ips=[container_ip],
            container_ipv4_ips=[],  # No IPv4 IPs for single-node
        )


initialize_clustered_function = synchronize_api(_initialize_clustered_function)
