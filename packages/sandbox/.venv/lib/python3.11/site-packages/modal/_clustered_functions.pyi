import modal.client
import typing
import typing_extensions

class ClusterInfo:
    """ClusterInfo(rank: int, cluster_id: str, container_ips: list[str], container_ipv4_ips: list[str])"""

    rank: int
    cluster_id: str
    container_ips: list[str]
    container_ipv4_ips: list[str]

    def __init__(self, rank: int, cluster_id: str, container_ips: list[str], container_ipv4_ips: list[str]) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __repr__(self):
        """Return repr(self)."""
        ...

    def __eq__(self, other):
        """Return self==value."""
        ...

def get_cluster_info() -> ClusterInfo: ...
async def _initialize_clustered_function(client: modal.client._Client, task_id: str, world_size: int): ...

class __initialize_clustered_function_spec(typing_extensions.Protocol):
    def __call__(self, /, client: modal.client.Client, task_id: str, world_size: int): ...
    async def aio(self, /, client: modal.client.Client, task_id: str, world_size: int): ...

initialize_clustered_function: __initialize_clustered_function_spec

cluster_info: typing.Optional[ClusterInfo]
