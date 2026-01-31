import modal.client
import modal_proto.api_pb2
import subprocess
import typing
import typing_extensions

class _FlashManager:
    def __init__(
        self,
        client: modal.client._Client,
        port: int,
        process: typing.Optional[subprocess.Popen] = None,
        health_check_url: typing.Optional[str] = None,
        startup_timeout: int = 30,
        exit_grace_period: int = 0,
        h2_enabled: bool = False,
    ):
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    async def is_port_connection_healthy(
        self, process: typing.Optional[subprocess.Popen], timeout: float = 0.5
    ) -> tuple[bool, typing.Optional[Exception]]: ...
    async def _start(self): ...
    async def _deregister(self): ...
    async def _drain_container(self):
        """Background task that checks if we've encountered too many failures and drains the container if so."""
        ...

    async def _wait_for_port_success(self, host: str, port: int) -> bool: ...
    async def _run_heartbeat(self, host: str, port: int): ...
    def get_container_url(self): ...
    async def stop(self): ...
    async def close(self): ...

class FlashManager:
    def __init__(
        self,
        client: modal.client.Client,
        port: int,
        process: typing.Optional[subprocess.Popen] = None,
        health_check_url: typing.Optional[str] = None,
        startup_timeout: int = 30,
        exit_grace_period: int = 0,
        h2_enabled: bool = False,
    ): ...

    class __is_port_connection_healthy_spec(typing_extensions.Protocol):
        def __call__(
            self, /, process: typing.Optional[subprocess.Popen], timeout: float = 0.5
        ) -> tuple[bool, typing.Optional[Exception]]: ...
        async def aio(
            self, /, process: typing.Optional[subprocess.Popen], timeout: float = 0.5
        ) -> tuple[bool, typing.Optional[Exception]]: ...

    is_port_connection_healthy: __is_port_connection_healthy_spec

    class ___start_spec(typing_extensions.Protocol):
        def __call__(self, /): ...
        async def aio(self, /): ...

    _start: ___start_spec

    class ___deregister_spec(typing_extensions.Protocol):
        def __call__(self, /): ...
        async def aio(self, /): ...

    _deregister: ___deregister_spec

    class ___drain_container_spec(typing_extensions.Protocol):
        def __call__(self, /):
            """Background task that checks if we've encountered too many failures and drains the container if so."""
            ...

        async def aio(self, /):
            """Background task that checks if we've encountered too many failures and drains the container if so."""
            ...

    _drain_container: ___drain_container_spec

    class ___wait_for_port_success_spec(typing_extensions.Protocol):
        def __call__(self, /, host: str, port: int) -> bool: ...
        async def aio(self, /, host: str, port: int) -> bool: ...

    _wait_for_port_success: ___wait_for_port_success_spec

    class ___run_heartbeat_spec(typing_extensions.Protocol):
        def __call__(self, /, host: str, port: int): ...
        async def aio(self, /, host: str, port: int): ...

    _run_heartbeat: ___run_heartbeat_spec

    def get_container_url(self): ...

    class __stop_spec(typing_extensions.Protocol):
        def __call__(self, /): ...
        async def aio(self, /): ...

    stop: __stop_spec

    class __close_spec(typing_extensions.Protocol):
        def __call__(self, /): ...
        async def aio(self, /): ...

    close: __close_spec

class __flash_forward_spec(typing_extensions.Protocol):
    def __call__(
        self,
        /,
        port: int,
        process: typing.Optional[subprocess.Popen] = None,
        health_check_url: typing.Optional[str] = None,
        startup_timeout: int = 30,
        exit_grace_period: int = 0,
        h2_enabled: bool = False,
    ) -> FlashManager:
        """Forward a port to the Modal Flash service, exposing that port as a stable web endpoint.
        This is a highly experimental method that can break or be removed at any time without warning.
        Do not use this method unless explicitly instructed to do so by Modal support.
        """
        ...

    async def aio(
        self,
        /,
        port: int,
        process: typing.Optional[subprocess.Popen] = None,
        health_check_url: typing.Optional[str] = None,
        startup_timeout: int = 30,
        exit_grace_period: int = 0,
        h2_enabled: bool = False,
    ) -> FlashManager:
        """Forward a port to the Modal Flash service, exposing that port as a stable web endpoint.
        This is a highly experimental method that can break or be removed at any time without warning.
        Do not use this method unless explicitly instructed to do so by Modal support.
        """
        ...

flash_forward: __flash_forward_spec

class _FlashPrometheusAutoscaler:
    def __init__(
        self,
        client: modal.client._Client,
        app_name: str,
        cls_name: str,
        metrics_endpoint: str,
        target_metric: str,
        target_metric_value: float,
        min_containers: typing.Optional[int],
        max_containers: typing.Optional[int],
        buffer_containers: typing.Optional[int],
        scale_up_tolerance: float,
        scale_down_tolerance: float,
        scale_up_stabilization_window_seconds: int,
        scale_down_stabilization_window_seconds: int,
        autoscaling_interval_seconds: int,
    ):
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    async def start(self): ...
    async def _run_autoscaler_loop(self): ...
    async def _compute_target_containers(self, current_replicas: int) -> int:
        """Gets metrics from container to autoscale up or down."""
        ...

    def _calculate_desired_replicas(
        self,
        n_current_replicas: int,
        sum_metric: float,
        n_containers_with_metrics: int,
        n_total_containers: int,
        target_metric_value: float,
    ) -> int:
        """Calculate the desired number of replicas to autoscale to."""
        ...

    async def _get_scaling_info(self, containers) -> tuple[float, int]:
        """Get metrics using container exposed metrics endpoints."""
        ...

    async def _get_metrics(self, url: str) -> typing.Optional[dict[str, list[typing.Any]]]: ...
    async def _get_all_containers(self): ...
    async def _set_target_slots(self, target_slots: int): ...
    def _make_scaling_decision(
        self,
        current_replicas: int,
        autoscaling_decisions: list[tuple[float, int]],
        scale_up_stabilization_window_seconds: int = 0,
        scale_down_stabilization_window_seconds: int = 300,
        min_containers: typing.Optional[int] = None,
        max_containers: typing.Optional[int] = None,
        buffer_containers: typing.Optional[int] = None,
    ) -> int:
        """Return the target number of containers following (simplified) Kubernetes HPA
        stabilization-window semantics.

        Args:
            current_replicas: Current number of running Pods/containers.
            autoscaling_decisions: List of (timestamp, desired_replicas) pairs, where
                                   timestamp is a UNIX epoch float (seconds).
                                   The list *must* contain at least one entry and should
                                   already include the most-recent measurement.
            scale_up_stabilization_window_seconds: 0 disables the up-window.
            scale_down_stabilization_window_seconds: 0 disables the down-window.
            min_containers / max_containers: Clamp the final decision to this range.

        Returns:
            The target number of containers.
        """
        ...

    async def stop(self): ...

class FlashPrometheusAutoscaler:
    def __init__(
        self,
        client: modal.client.Client,
        app_name: str,
        cls_name: str,
        metrics_endpoint: str,
        target_metric: str,
        target_metric_value: float,
        min_containers: typing.Optional[int],
        max_containers: typing.Optional[int],
        buffer_containers: typing.Optional[int],
        scale_up_tolerance: float,
        scale_down_tolerance: float,
        scale_up_stabilization_window_seconds: int,
        scale_down_stabilization_window_seconds: int,
        autoscaling_interval_seconds: int,
    ): ...

    class __start_spec(typing_extensions.Protocol):
        def __call__(self, /): ...
        async def aio(self, /): ...

    start: __start_spec

    class ___run_autoscaler_loop_spec(typing_extensions.Protocol):
        def __call__(self, /): ...
        async def aio(self, /): ...

    _run_autoscaler_loop: ___run_autoscaler_loop_spec

    class ___compute_target_containers_spec(typing_extensions.Protocol):
        def __call__(self, /, current_replicas: int) -> int:
            """Gets metrics from container to autoscale up or down."""
            ...

        async def aio(self, /, current_replicas: int) -> int:
            """Gets metrics from container to autoscale up or down."""
            ...

    _compute_target_containers: ___compute_target_containers_spec

    def _calculate_desired_replicas(
        self,
        n_current_replicas: int,
        sum_metric: float,
        n_containers_with_metrics: int,
        n_total_containers: int,
        target_metric_value: float,
    ) -> int:
        """Calculate the desired number of replicas to autoscale to."""
        ...

    class ___get_scaling_info_spec(typing_extensions.Protocol):
        def __call__(self, /, containers) -> tuple[float, int]:
            """Get metrics using container exposed metrics endpoints."""
            ...

        async def aio(self, /, containers) -> tuple[float, int]:
            """Get metrics using container exposed metrics endpoints."""
            ...

    _get_scaling_info: ___get_scaling_info_spec

    class ___get_metrics_spec(typing_extensions.Protocol):
        def __call__(self, /, url: str) -> typing.Optional[dict[str, list[typing.Any]]]: ...
        async def aio(self, /, url: str) -> typing.Optional[dict[str, list[typing.Any]]]: ...

    _get_metrics: ___get_metrics_spec

    class ___get_all_containers_spec(typing_extensions.Protocol):
        def __call__(self, /): ...
        async def aio(self, /): ...

    _get_all_containers: ___get_all_containers_spec

    class ___set_target_slots_spec(typing_extensions.Protocol):
        def __call__(self, /, target_slots: int): ...
        async def aio(self, /, target_slots: int): ...

    _set_target_slots: ___set_target_slots_spec

    def _make_scaling_decision(
        self,
        current_replicas: int,
        autoscaling_decisions: list[tuple[float, int]],
        scale_up_stabilization_window_seconds: int = 0,
        scale_down_stabilization_window_seconds: int = 300,
        min_containers: typing.Optional[int] = None,
        max_containers: typing.Optional[int] = None,
        buffer_containers: typing.Optional[int] = None,
    ) -> int:
        """Return the target number of containers following (simplified) Kubernetes HPA
        stabilization-window semantics.

        Args:
            current_replicas: Current number of running Pods/containers.
            autoscaling_decisions: List of (timestamp, desired_replicas) pairs, where
                                   timestamp is a UNIX epoch float (seconds).
                                   The list *must* contain at least one entry and should
                                   already include the most-recent measurement.
            scale_up_stabilization_window_seconds: 0 disables the up-window.
            scale_down_stabilization_window_seconds: 0 disables the down-window.
            min_containers / max_containers: Clamp the final decision to this range.

        Returns:
            The target number of containers.
        """
        ...

    class __stop_spec(typing_extensions.Protocol):
        def __call__(self, /): ...
        async def aio(self, /): ...

    stop: __stop_spec

class __flash_prometheus_autoscaler_spec(typing_extensions.Protocol):
    def __call__(
        self,
        /,
        app_name: str,
        cls_name: str,
        metrics_endpoint: str,
        target_metric: str,
        target_metric_value: float,
        min_containers: typing.Optional[int] = None,
        max_containers: typing.Optional[int] = None,
        scale_up_tolerance: float = 0.1,
        scale_down_tolerance: float = 0.1,
        scale_up_stabilization_window_seconds: int = 0,
        scale_down_stabilization_window_seconds: int = 300,
        autoscaling_interval_seconds: int = 15,
        buffer_containers: typing.Optional[int] = None,
    ) -> FlashPrometheusAutoscaler:
        """Autoscale a Flash service based on containers' Prometheus metrics.

        The package `prometheus_client` is required to use this method.

        This is a highly experimental method that can break or be removed at any time without warning.
        Do not use this method unless explicitly instructed to do so by Modal support.
        """
        ...

    async def aio(
        self,
        /,
        app_name: str,
        cls_name: str,
        metrics_endpoint: str,
        target_metric: str,
        target_metric_value: float,
        min_containers: typing.Optional[int] = None,
        max_containers: typing.Optional[int] = None,
        scale_up_tolerance: float = 0.1,
        scale_down_tolerance: float = 0.1,
        scale_up_stabilization_window_seconds: int = 0,
        scale_down_stabilization_window_seconds: int = 300,
        autoscaling_interval_seconds: int = 15,
        buffer_containers: typing.Optional[int] = None,
    ) -> FlashPrometheusAutoscaler:
        """Autoscale a Flash service based on containers' Prometheus metrics.

        The package `prometheus_client` is required to use this method.

        This is a highly experimental method that can break or be removed at any time without warning.
        Do not use this method unless explicitly instructed to do so by Modal support.
        """
        ...

flash_prometheus_autoscaler: __flash_prometheus_autoscaler_spec

class __flash_get_containers_spec(typing_extensions.Protocol):
    def __call__(self, /, app_name: str, cls_name: str) -> list[dict[str, typing.Any]]:
        """Return a list of flash containers for a deployed Flash service.

        This is a highly experimental method that can break or be removed at any time without warning.
        Do not use this method unless explicitly instructed to do so by Modal support.
        """
        ...

    async def aio(self, /, app_name: str, cls_name: str) -> list[dict[str, typing.Any]]:
        """Return a list of flash containers for a deployed Flash service.

        This is a highly experimental method that can break or be removed at any time without warning.
        Do not use this method unless explicitly instructed to do so by Modal support.
        """
        ...

flash_get_containers: __flash_get_containers_spec

def _http_server(
    port: typing.Optional[int] = None,
    *,
    proxy_regions: list[str] = [],
    startup_timeout: int = 30,
    exit_grace_period: typing.Optional[int] = None,
    h2_enabled: bool = False,
):
    """Decorator for Flash-enabled HTTP servers on Modal classes.

    Args:
        port: The local port to forward to the HTTP server.
        proxy_regions: The regions to proxy the HTTP server to.
        startup_timeout: The maximum time to wait for the HTTP server to start.
        exit_grace_period: The time to wait for the HTTP server to exit gracefully.
    """
    ...

def http_server(
    port: typing.Optional[int] = None,
    *,
    proxy_regions: list[str] = [],
    startup_timeout: int = 30,
    exit_grace_period: typing.Optional[int] = None,
    h2_enabled: bool = False,
):
    """Decorator for Flash-enabled HTTP servers on Modal classes.

    Args:
        port: The local port to forward to the HTTP server.
        proxy_regions: The regions to proxy the HTTP server to.
        startup_timeout: The maximum time to wait for the HTTP server to start.
        exit_grace_period: The time to wait for the HTTP server to exit gracefully.
    """
    ...

class _FlashContainerEntry:
    """A class that manages the lifecycle of Flash manager for Flash containers.

    It is intentional that stop() runs before exit handlers and close().
    This ensures the container is deregistered first, preventing new requests from being routed to it
    while exit handlers execute and the exit grace period elapses, before finally closing the tunnel.
    """
    def __init__(self, http_config: modal_proto.api_pb2.HTTPConfig):
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def enter(self): ...
    def stop(self): ...
    def close(self): ...
