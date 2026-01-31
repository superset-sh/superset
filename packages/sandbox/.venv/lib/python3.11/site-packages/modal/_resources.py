# Copyright Modal Labs 2024
from typing import Optional, Union

from modal_proto import api_pb2

from .exception import InvalidError
from .gpu import GPU_T, parse_gpu_config


def convert_fn_config_to_resources_config(
    *,
    cpu: Optional[Union[float, tuple[float, float]]],
    memory: Optional[Union[int, tuple[int, int]]],
    gpu: GPU_T,
    ephemeral_disk: Optional[int],
    rdma: Optional[bool] = None,
) -> api_pb2.Resources:
    gpu_config = parse_gpu_config(gpu)
    if cpu and isinstance(cpu, tuple):
        if not cpu[0]:
            raise InvalidError("CPU request must be a positive number")
        elif not cpu[1]:
            raise InvalidError("CPU limit must be a positive number")
        milli_cpu = int(1000 * cpu[0])
        milli_cpu_max = int(1000 * cpu[1])
        if milli_cpu_max < milli_cpu:
            raise InvalidError(f"Cannot specify a CPU limit lower than request: {milli_cpu_max} < {milli_cpu}")
    elif cpu and isinstance(cpu, (float, int)):
        milli_cpu = int(1000 * cpu)
        milli_cpu_max = None
    else:
        milli_cpu = None
        milli_cpu_max = None

    if memory and isinstance(memory, int):
        memory_mb = memory
        memory_mb_max = 0  # no limit
    elif memory and isinstance(memory, tuple):
        memory_mb, memory_mb_max = memory
        if memory_mb_max < memory_mb:
            raise InvalidError(f"Cannot specify a memory limit lower than request: {memory_mb_max} < {memory_mb}")
    else:
        memory_mb = 0
        memory_mb_max = 0
    return api_pb2.Resources(
        milli_cpu=milli_cpu,
        milli_cpu_max=milli_cpu_max,
        gpu_config=gpu_config,
        memory_mb=memory_mb,
        memory_mb_max=memory_mb_max,
        ephemeral_disk_mb=ephemeral_disk,
        rdma=rdma or False,
    )
