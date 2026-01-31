# Copyright Modal Labs 2022
from typing import Union

from modal_proto import api_pb2

from ._utils.deprecation import deprecation_warning
from .exception import InvalidError


class _GPUConfig:
    gpu_type: str
    count: int

    def __init__(self, gpu_type: str, count: int):
        name = self.__class__.__name__
        str_value = gpu_type
        if count > 1:
            str_value += f":{count}"
        deprecation_warning((2025, 2, 7), f'`gpu={name}(...)` is deprecated. Use `gpu="{str_value}"` instead.')
        self.gpu_type = gpu_type
        self.count = count

    def _to_proto(self) -> api_pb2.GPUConfig:
        """Convert this GPU config to an internal protobuf representation."""
        return api_pb2.GPUConfig(
            gpu_type=self.gpu_type,
            count=self.count,
        )


class T4(_GPUConfig):
    """
    [NVIDIA T4 Tensor Core](https://www.nvidia.com/en-us/data-center/tesla-t4/) GPU class.

    A low-cost data center GPU based on the Turing architecture, providing 16GB of GPU memory.
    """

    def __init__(
        self,
        count: int = 1,  # Number of GPUs per container. Defaults to 1.
    ):
        super().__init__("T4", count)

    def __repr__(self):
        return f"GPU(T4, count={self.count})"


class L4(_GPUConfig):
    """
    [NVIDIA L4 Tensor Core](https://www.nvidia.com/en-us/data-center/l4/) GPU class.

    A mid-tier data center GPU based on the Ada Lovelace architecture, providing 24GB of GPU memory.
    Includes RTX (ray tracing) support.
    """

    def __init__(
        self,
        count: int = 1,  # Number of GPUs per container. Defaults to 1.
    ):
        super().__init__("L4", count)

    def __repr__(self):
        return f"GPU(L4, count={self.count})"


class A100(_GPUConfig):
    """
    [NVIDIA A100 Tensor Core](https://www.nvidia.com/en-us/data-center/a100/) GPU class.

    The flagship data center GPU of the Ampere architecture. Available in 40GB and 80GB GPU memory configurations.
    """

    def __init__(
        self,
        *,
        count: int = 1,  # Number of GPUs per container. Defaults to 1.
        size: Union[str, None] = None,  # Select GB configuration of GPU device: "40GB" or "80GB". Defaults to "40GB".
    ):
        if size == "40GB" or not size:
            super().__init__("A100-40GB", count)
        elif size == "80GB":
            super().__init__("A100-80GB", count)
        else:
            raise ValueError(f"size='{size}' is invalid. A100s can only have memory values of 40GB or 80GB.")

    def __repr__(self):
        return f"GPU({self.gpu_type}, count={self.count})"


class A10G(_GPUConfig):
    """
    [NVIDIA A10G Tensor Core](https://www.nvidia.com/en-us/data-center/products/a10-gpu/) GPU class.

    A mid-tier data center GPU based on the Ampere architecture, providing 24 GB of memory.
    A10G GPUs deliver up to 3.3x better ML training performance, 3x better ML inference performance,
    and 3x better graphics performance, in comparison to NVIDIA T4 GPUs.
    """

    def __init__(
        self,
        *,
        # Number of GPUs per container. Defaults to 1.
        # Useful if you have very large models that don't fit on a single GPU.
        count: int = 1,
    ):
        super().__init__("A10G", count)

    def __repr__(self):
        return f"GPU(A10G, count={self.count})"


class H100(_GPUConfig):
    """
    [NVIDIA H100 Tensor Core](https://www.nvidia.com/en-us/data-center/h100/) GPU class.

    The flagship data center GPU of the Hopper architecture.
    Enhanced support for FP8 precision and a Transformer Engine that provides up to 4X faster training
    over the prior generation for GPT-3 (175B) models.
    """

    def __init__(
        self,
        *,
        # Number of GPUs per container. Defaults to 1.
        # Useful if you have very large models that don't fit on a single GPU.
        count: int = 1,
    ):
        super().__init__("H100", count)

    def __repr__(self):
        return f"GPU(H100, count={self.count})"


class L40S(_GPUConfig):
    """
    [NVIDIA L40S](https://www.nvidia.com/en-us/data-center/l40s/) GPU class.

    The L40S is a data center GPU for the Ada Lovelace architecture. It has 48 GB of on-chip
    GDDR6 RAM and enhanced support for FP8 precision.
    """

    def __init__(
        self,
        *,
        # Number of GPUs per container. Defaults to 1.
        # Useful if you have very large models that don't fit on a single GPU.
        count: int = 1,
    ):
        super().__init__("L40S", count)

    def __repr__(self):
        return f"GPU(L40S, count={self.count})"


class Any(_GPUConfig):
    """Selects any one of the GPU classes available within Modal, according to availability."""

    def __init__(self, *, count: int = 1):
        super().__init__("ANY", count)

    def __repr__(self):
        return f"GPU(Any, count={self.count})"


__doc__ = """
**GPU configuration shortcodes**

You can pass a wide range of `str` values for the `gpu` parameter of
[`@app.function`](https://modal.com/docs/reference/modal.App#function).

For instance:
- `gpu="H100"` will attach 1 H100 GPU to each container
- `gpu="L40S"` will attach 1 L40S GPU to each container
- `gpu="T4:4"` will attach 4 T4 GPUs to each container

You can see a list of Modal GPU options in the
[GPU docs](https://modal.com/docs/guide/gpu).

**Example**

```python
@app.function(gpu="A100-80GB:4")
def my_gpu_function():
    ... # This will have 4 A100-80GB with each container
```

**Deprecation notes**

An older deprecated way to configure GPU is also still supported,
but will be removed in future versions of Modal. Examples:

- `gpu=modal.gpu.H100()` will attach 1 H100 GPU to each container
- `gpu=modal.gpu.T4(count=4)` will attach 4 T4 GPUs to each container
- `gpu=modal.gpu.A100()` will attach 1 A100-40GB GPUs to each container
- `gpu=modal.gpu.A100(size="80GB")` will attach 1 A100-80GB GPUs to each container
"""

GPU_T = Union[None, str, _GPUConfig]


def parse_gpu_config(value: GPU_T) -> api_pb2.GPUConfig:
    if isinstance(value, _GPUConfig):
        return value._to_proto()
    elif isinstance(value, str):
        count = 1
        if ":" in value:
            value, count_str = value.split(":", 1)
            try:
                count = int(count_str)
            except ValueError:
                raise InvalidError(f"Invalid GPU count: {count_str}. Value must be an integer.")
        gpu_type = value.upper()
        return api_pb2.GPUConfig(
            gpu_type=gpu_type,
            count=count,
        )
    elif value is None:
        return api_pb2.GPUConfig()
    else:
        raise InvalidError(
            f"Invalid GPU config: {value}. Value must be a string or `None` (or a deprecated `modal.gpu` object)"
        )
