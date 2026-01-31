# Copyright Modal Labs 2022
import inspect
import platform
import shlex
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Optional

import typer
from click import ClickException

from .._functions import _FunctionSpec
from ..app import App
from ..environments import ensure_env
from ..exception import InvalidError, NotFoundError
from ..functions import Function
from ..image import Image
from ..mount import _Mount
from ..runner import interactive_shell
from ..sandbox import Sandbox
from ..secret import Secret
from ..volume import Volume
from .container import exec
from .import_refs import (
    MethodReference,
    import_and_filter,
    parse_import_ref,
)
from .run import _get_runnable_list
from .utils import ENV_OPTION, is_tty


def _params_from_signature(
    func: Callable[..., Any],
) -> dict[str, typer.models.ParameterInfo]:
    sig = inspect.signature(func)
    params = {param_name: param.default for param_name, param in sig.parameters.items()}
    assert all(isinstance(param, typer.models.ParameterInfo) for param in params.values()), (
        f"All params to {func.__name__} must be of type typer.models.ParameterInfo."
    )
    return params


def _passed_forbidden_args(
    param_objs: dict[str, typer.models.ParameterInfo],
    passed_args: dict[str, Any],
    allowed: Callable[[str], bool],
) -> list[str]:
    """Check which forbidden arguments were passed with non-default values."""
    passed_forbidden: list[str] = []
    for param_name, param_obj in param_objs.items():
        if allowed(param_name):
            continue

        assert param_obj.param_decls is not None, "All params must be typer.models.ParameterInfo, and have param_decls."

        if passed_args.get(param_name) != param_obj.default:
            passed_forbidden.append("/".join(param_obj.param_decls))

    return passed_forbidden


def _is_valid_modal_id(ref: str, prefix: str) -> bool:
    assert prefix.endswith("-")
    return ref.startswith(prefix) and len(ref[len(prefix) :]) > 0 and ref[len(prefix) :].isalnum()


def _is_running_container_ref(ref: Optional[str]) -> bool:
    if ref is None:
        return False
    return _is_valid_modal_id(ref, "sb-") or _is_valid_modal_id(ref, "ta-")


def _start_shell_in_running_container(ref: str, cmd: str, pty: bool) -> None:
    if _is_valid_modal_id(ref, "sb-"):
        try:
            sandbox = Sandbox.from_id(ref)
            ref = sandbox._get_task_id()
        except NotFoundError as e:
            raise ClickException(f"Sandbox '{ref}' not found (is it still running?)")
        except Exception as e:
            raise ClickException(f"Error connecting to Sandbox '{ref}': {str(e)}")

    assert _is_valid_modal_id(ref, "ta-")
    try:
        exec(container_id=ref, command=shlex.split(cmd), pty=pty)
    except NotFoundError as e:
        raise ClickException(f"Container '{ref}' not found (is it still running?)")
    except Exception as e:
        raise ClickException(f"Error connecting to container '{ref}': {str(e)}")


def _function_spec_from_ref(ref: str, use_module_mode: bool) -> _FunctionSpec:
    import_ref = parse_import_ref(ref, use_module_mode=use_module_mode)
    runnable, all_usable_commands = import_and_filter(
        import_ref, base_cmd="modal shell", accept_local_entrypoint=False, accept_webhook=True
    )
    if not runnable:
        help_header = (
            "Specify a Modal function to start a shell session for. E.g.\n"
            f"> modal shell {import_ref.file_or_module}::my_function"
        )

        if all_usable_commands:
            help_footer = f"The selected module '{import_ref.file_or_module}' has the following choices:\n\n"
            help_footer += _get_runnable_list(all_usable_commands)
        else:
            help_footer = f"The selected module '{import_ref.file_or_module}' has no Modal functions or classes."

        raise ClickException(f"{help_header}\n\n{help_footer}")

    if isinstance(runnable, MethodReference):
        # TODO: let users specify a class instead of a method, since they use the same environment
        class_service_function = runnable.cls._get_class_service_function()
        return class_service_function.spec
    elif isinstance(runnable, Function):
        return runnable.spec

    raise ValueError("Referenced entity is not a Modal Function or Cls")


def _start_shell_from_function_spec(
    app: App,
    cmds: list[str],
    env: str,
    timeout: int,
    function_spec: _FunctionSpec,
    pty: bool,
) -> None:
    interactive_shell(
        app,
        cmds=cmds,
        environment_name=env,
        timeout=timeout,
        image=function_spec.image,
        mounts=function_spec.mounts,
        secrets=function_spec.secrets,
        network_file_systems=function_spec.network_file_systems,
        gpu=function_spec.gpus,
        cloud=function_spec.cloud,
        cpu=function_spec.cpu,
        memory=function_spec.memory,
        volumes=function_spec.volumes,
        region=function_spec.scheduler_placement.regions if function_spec.scheduler_placement else None,
        pty=pty,
        proxy=function_spec.proxy,
    )


def _start_shell_from_image(
    app: App,
    cmds: list[str],
    env: str,
    timeout: int,
    modal_image: Optional[Image],
    volume: list[str],
    secret: list[str],
    add_local: list[str],
    cpu: Optional[int],
    memory: Optional[int],
    gpu: Optional[str],
    cloud: Optional[str],
    region: Optional[str],
    pty: bool,
) -> None:
    volumes = {f"/mnt/{vol}": Volume.from_name(vol) for vol in volume}
    secrets = [Secret.from_name(s) for s in secret]

    mounts = []
    for local_path_str in add_local:
        local_path = Path(local_path_str).expanduser().resolve()
        remote_path = PurePosixPath(f"/mnt/{local_path.name}")

        if local_path.is_dir():
            m = _Mount._from_local_dir(local_path, remote_path=remote_path)
        else:
            m = _Mount._from_local_file(local_path, remote_path=remote_path)
        mounts.append(m)

    interactive_shell(
        app,
        cmds=cmds,
        environment_name=env,
        timeout=timeout,
        image=modal_image,
        mounts=mounts,
        cpu=cpu,
        memory=memory,
        gpu=gpu,
        cloud=cloud,
        volumes=volumes,
        secrets=secrets,
        region=region.split(",") if region else [],
        pty=pty,
    )


def shell(
    ref: Optional[str] = typer.Argument(
        default=None,
        help=(
            "ID of running container or Sandbox, or path to a Python file containing an App."
            " Can also include a Function specifier, like `module.py::func`, if the file defines multiple Functions."
        ),
    ),
    cmd: str = typer.Option("/bin/bash", "-c", "--cmd", help="Command to run inside the Modal image."),
    env: Optional[str] = ENV_OPTION,
    image: Optional[str] = typer.Option(
        None, "--image", help="Container image tag for inside the shell (if not using REF)."
    ),
    add_python: Optional[str] = typer.Option(None, "--add-python", help="Add Python to the image (if not using REF)."),
    volume: Optional[list[str]] = typer.Option(
        None,
        "--volume",
        help=(
            "Name of a `modal.Volume` to mount inside the shell at `/mnt/{name}` (if not using REF)."
            " Can be used multiple times."
        ),
    ),
    add_local: Optional[list[str]] = typer.Option(
        None,
        "--add-local",
        help=(
            "Local file or directory to mount inside the shell at `/mnt/{basename}` (if not using REF)."
            " Can be used multiple times."
        ),
    ),
    secret: Optional[list[str]] = typer.Option(
        None,
        "--secret",
        help=("Name of a `modal.Secret` to mount inside the shell (if not using REF). Can be used multiple times."),
    ),
    cpu: Optional[int] = typer.Option(
        None, "--cpu", help="Number of CPUs to allocate to the shell (if not using REF)."
    ),
    memory: Optional[int] = typer.Option(
        None, "--memory", help="Memory to allocate for the shell, in MiB (if not using REF)."
    ),
    gpu: Optional[str] = typer.Option(
        None,
        "--gpu",
        help="GPUs to request for the shell, if any. Examples are `any`, `a10g`, `a100:4` (if not using REF).",
    ),
    cloud: Optional[str] = typer.Option(
        None,
        "--cloud",
        help=(
            "Cloud provider to run the shell on. Possible values are `aws`, `gcp`, `oci`, `auto` (if not using REF)."
        ),
    ),
    region: Optional[str] = typer.Option(
        None,
        "--region",
        help=(
            "Region(s) to run the container on. "
            "Can be a single region or a comma-separated list to choose from (if not using REF)."
        ),
    ),
    pty: Optional[bool] = typer.Option(None, "--pty", help="Run the command using a PTY."),
    use_module_mode: bool = typer.Option(
        False, "-m", help="Interpret argument as a Python module path instead of a file/script path"
    ),
):
    """Run a command or interactive shell inside a Modal container.

    **Examples:**

    Start an interactive shell inside the default Debian-based image:

    ```
    modal shell
    ```

    Start an interactive shell with the spec for `my_function` in your App
    (uses the same image, volumes, mounts, etc.):

    ```
    modal shell hello_world.py::my_function
    ```

    Or, if you're using a [modal.Cls](https://modal.com/docs/reference/modal.Cls)
    you can refer to a `@modal.method` directly:

    ```
    modal shell hello_world.py::MyClass.my_method
    ```

    Start a `python` shell:

    ```
    modal shell hello_world.py --cmd=python
    ```

    Run a command with your function's spec and pipe the output to a file:

    ```
    modal shell hello_world.py -c 'uv pip list' > env.txt
    ```

    Connect to a running Sandbox by ID:

    ```
    modal shell sb-abc123xyz
    ```
    """
    if pty is None:
        pty = is_tty()

    if platform.system() == "Windows":
        raise InvalidError("`modal shell` is currently not supported on Windows")

    param_objs = _params_from_signature(shell)

    if ref is not None and _is_running_container_ref(ref):
        # We're attaching to an already running container or Sandbox.
        if passed_forbidden := _passed_forbidden_args(
            param_objs, locals(), allowed=lambda p: p in {"cmd", "pty", "ref"}
        ):
            raise ClickException(
                f"Cannot specify container configuration arguments ({', '.join(passed_forbidden)}) "
                f"when attaching to an already running container or Sandbox ('{ref}')."
            )

        _start_shell_in_running_container(ref, cmd, pty)
        return

    # We're not attaching to an existing container, so we need to create a new one.
    env = ensure_env(env)
    app = App("modal shell")

    # NB: invoking under bash makes --cmd a lot more flexible.
    cmds = shlex.split(f'/bin/bash -c "{cmd}"')
    timeout = 3600

    if ref is not None and not _is_valid_modal_id(ref, "im-"):
        # If ref it not a Modal Image ID, then it's a function reference, and we'll start a new container from its spec.
        if passed_forbidden := _passed_forbidden_args(
            param_objs, locals(), allowed=lambda p: p in {"cmd", "env", "pty", "ref", "use_module_mode"}
        ):
            raise ClickException(
                f"Cannot specify container configuration arguments ({', '.join(passed_forbidden)}) "
                f"when starting a new container from a function reference ('{ref}')."
            )

        function_spec = _function_spec_from_ref(ref, use_module_mode)
        _start_shell_from_function_spec(app, cmds, env, timeout, function_spec, pty)
        return

    if ref is not None and _is_valid_modal_id(ref, "im-"):
        if passed_forbidden := _passed_forbidden_args(
            param_objs, locals(), allowed=lambda p: p not in {"add_python", "image"}
        ):
            raise ClickException(
                f"Cannot specify {', '.join(passed_forbidden)} argument(s) "
                f"when starting a new container from a Modal Image ID ('{ref}')."
            )
        modal_image = Image.from_id(ref)
    else:
        modal_image = Image.from_registry(image, add_python=add_python) if image else None

    _start_shell_from_image(
        app,
        cmds,
        env,
        timeout,
        modal_image,
        volume or [],
        secret or [],
        add_local or [],
        cpu,
        memory,
        gpu,
        cloud,
        region,
        pty,
    )
