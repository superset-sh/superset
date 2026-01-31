# Copyright Modal Labs 2022
import asyncio
import functools
import inspect
import re
import sys
import time
import typing
from dataclasses import dataclass
from typing import Any, Callable, Optional

import click
import typer
from click import ClickException
from typing_extensions import TypedDict

from ..app import App, LocalEntrypoint
from ..cls import _get_class_constructor_signature
from ..config import config
from ..environments import ensure_env
from ..exception import ExecutionError, InvalidError, _CliUserExecutionError
from ..functions import Function
from ..output import enable_output
from ..runner import deploy_app, run_app
from ..serving import serve_app
from .import_refs import (
    CLICommand,
    MethodReference,
    _get_runnable_app,
    import_and_filter,
    import_app_from_ref,
    parse_import_ref,
)
from .utils import ENV_OPTION, ENV_OPTION_HELP, stream_app_logs


class ParameterMetadata(TypedDict):
    name: str
    default: Any
    annotation: Any
    type_hint: Any  # same as annotation but evaluated by typing.get_type_hints
    kind: Any


class AnyParamType(click.ParamType):
    name = "any"

    def convert(self, value, param, ctx):
        return value


class LiteralIntParamType(click.Choice):
    """A ParamType for Literal types containing only integers."""

    def __init__(self, literal_values: tuple[int, ...]):
        self.int_values = {str(v): v for v in literal_values}
        super().__init__(list(self.int_values.keys()))

    def convert(self, value, param, ctx):
        # If value is already an int (e.g., from a default), validate and return it
        # Exclude bools since they're a subclass of int but we don't support them
        if isinstance(value, int) and not isinstance(value, bool):
            if value in self.int_values.values():
                return value
            # Invalid int - convert to string so Choice can generate a nice error message
            value = str(value)
        # Use Choice's validation for string inputs, then convert back to int
        str_value = super().convert(value, param, ctx)
        return self.int_values[str_value]


option_parsers = {
    "str": str,
    "int": int,
    "float": float,
    "bool": bool,
    "datetime.datetime": click.DateTime(),
    "Any": AnyParamType(),
}


class NoParserAvailable(InvalidError):
    pass


@dataclass
class CliRunnableSignature:
    parameters: dict[str, ParameterMetadata]
    has_variadic_args: bool


def safe_get_type_hints(func_or_cls: typing.Union[Callable[..., Any], type]) -> dict[str, type]:
    try:
        return typing.get_type_hints(func_or_cls)
    except Exception as exc:
        # E.g., if entrypoint type hints cannot be evaluated by local Python runtime
        msg = "Unable to generate command line interface for app entrypoint due to unparseable type hints:\n" + str(exc)
        raise ExecutionError(msg) from exc


def _get_cli_runnable_signature(sig: inspect.Signature, type_hints: dict[str, type]) -> CliRunnableSignature:
    has_variadic_args = False
    signature: dict[str, ParameterMetadata] = {}
    for param in sig.parameters.values():
        if param.kind == inspect.Parameter.VAR_POSITIONAL:
            has_variadic_args = True
        else:
            signature[param.name] = {
                "name": param.name,
                "default": param.default,
                "annotation": param.annotation,
                "type_hint": type_hints.get(param.name, "Any"),
                "kind": param.kind,
            }

    if has_variadic_args and len(signature) > 0:
        raise InvalidError("Functions with variable-length positional arguments (*args) cannot have other parameters.")

    return CliRunnableSignature(signature, has_variadic_args)


def _get_literal_values(type_hint: Any) -> Optional[tuple[Any, ...]]:
    """Extract values from a Literal type annotation.

    Returns None if not a Literal type, otherwise returns tuple of literal values.
    """
    try:
        origin = typing.get_origin(type_hint)
        if origin is typing.Literal:
            return typing.get_args(type_hint)
    except Exception:
        pass
    return None


def _get_param_type_as_str(annot: Any) -> str:
    """Return annotation as a string, handling various spellings for optional types."""
    annot_str = str(annot)
    annot_patterns = [
        r"typing\.Optional\[([\w.]+)\]",
        r"typing\.Union\[([\w.]+), NoneType\]",
        r"([\w.]+) \| None",
        r"<class '([\w\.]+)'>",
    ]
    for pat in annot_patterns:
        m = re.match(pat, annot_str)
        if m is not None:
            return m.group(1)
    return annot_str


def _add_click_options(func, parameters: dict[str, ParameterMetadata]):
    """Adds @click.option based on function signature

    Kind of like typer, but using options instead of positional arguments
    """
    for param in parameters.values():
        param_name = param["name"].replace("_", "-")
        cli_name = "--" + param_name

        parser: Any
        if (literal_values := _get_literal_values(param["type_hint"])) is not None:
            if all(isinstance(v, str) for v in literal_values):
                parser = click.Choice(list(literal_values))
            elif all(isinstance(v, int) and not isinstance(v, bool) for v in literal_values):
                parser = LiteralIntParamType(literal_values)
            else:
                # Mixed types, booleans, or other unsupported types
                msg = f"Parameter `{param_name}` has unparseable annotation: {param['annotation']}"
                raise NoParserAvailable(msg)
        else:
            param_type_str = _get_param_type_as_str(param["type_hint"])
            if param_type_str == "bool":
                cli_name += "/--no-" + param_name

            parser = option_parsers.get(param_type_str)
            if parser is None:
                msg = f"Parameter `{param_name}` has unparseable annotation: {param['annotation']}"
                raise NoParserAvailable(msg)
        kwargs: Any = {
            "type": parser,
        }
        if param["default"] is not inspect.Signature.empty:
            kwargs["default"] = param["default"]
        else:
            kwargs["required"] = True

        click.option(cli_name, **kwargs)(func)
    return func


def _get_clean_app_description(func_ref: str) -> str:
    # If possible, consider the 'ref' argument the start of the app's args. Everything
    # before it Modal CLI cruft (eg. `modal run --detach`).
    try:
        func_ref_arg_idx = sys.argv.index(func_ref)
        return " ".join(sys.argv[func_ref_arg_idx:])
    except ValueError:
        return " ".join(sys.argv)


def _write_local_result(result_path: str, res: Any):
    if isinstance(res, str):
        mode = "wt"
    elif isinstance(res, bytes):
        mode = "wb"
    else:
        res_type = type(res).__name__
        raise InvalidError(f"Function must return str or bytes when using `--write-result`; got {res_type}.")
    with open(result_path, mode) as fid:
        fid.write(res)


def _validate_interactive_quiet_params(ctx):
    interactive = ctx.obj["interactive"]
    show_progress = ctx.obj["show_progress"]

    if not show_progress and interactive:
        raise InvalidError("To use interactive mode, remove the --quiet flag")


def _make_click_function(app, signature: CliRunnableSignature, inner: Callable[[tuple[str, ...], dict[str, Any]], Any]):
    @click.pass_context
    def f(ctx, **kwargs):
        if signature.has_variadic_args:
            assert len(kwargs) == 0
            args = ctx.args
        else:
            args = ()

        _validate_interactive_quiet_params(ctx)

        show_progress: bool = ctx.obj["show_progress"]
        show_timestamps: bool = ctx.obj["show_timestamps"]
        with enable_output(show_progress, show_timestamps=show_timestamps):
            with run_app(
                app,
                detach=ctx.obj["detach"],
                environment_name=ctx.obj["env"],
                interactive=ctx.obj["interactive"],
            ):
                res = inner(args, kwargs)

            if result_path := ctx.obj["result_path"]:
                _write_local_result(result_path, res)

    return f


def _get_signature(func: typing.Any) -> inspect.Signature:
    """Returns signature with the original source annotations."""
    kwargs: dict[str, typing.Any] = {}
    if sys.version_info[:2] >= (3, 14):
        import annotationlib

        kwargs["annotation_format"] = annotationlib.Format.STRING
    return inspect.signature(func, **kwargs)


def _get_click_command_for_function(app: App, function: Function, ctx: click.Context):
    if function.is_generator:
        raise InvalidError("`modal run` is not supported for generator functions")

    sig: inspect.Signature = _get_signature(function.info.raw_f)
    type_hints = safe_get_type_hints(function.info.raw_f)
    signature: CliRunnableSignature = _get_cli_runnable_signature(sig, type_hints)

    def _inner(args, click_kwargs):
        if ctx.obj["detach"]:
            return function.spawn(*args, **click_kwargs).get()
        else:
            return function.remote(*args, **click_kwargs)

    f = _make_click_function(app, signature, _inner)

    with_click_options = _add_click_options(f, signature.parameters)

    if signature.has_variadic_args:
        return click.command(context_settings={"ignore_unknown_options": True, "allow_extra_args": True})(
            with_click_options
        )
    else:
        return click.command(with_click_options)


def _get_click_command_for_cls(app: App, method_ref: MethodReference, ctx: click.Context):
    parameters: dict[str, ParameterMetadata]
    cls = method_ref.cls
    method_name = method_ref.method_name

    user_cls = cls._get_user_cls()
    type_hints = safe_get_type_hints(user_cls)
    sig: inspect.Signature = _get_class_constructor_signature(user_cls)
    cls_signature: CliRunnableSignature = _get_cli_runnable_signature(sig, type_hints)

    if cls_signature.has_variadic_args:
        raise InvalidError("Modal classes cannot have variable-length positional arguments (*args).")

    partial_functions = cls._get_partial_functions()

    if method_name in ("*", ""):
        # auto infer method name - not sure if we have to support this...
        method_names = list(partial_functions.keys())
        if len(method_names) == 1:
            method_name = method_names[0]
        else:
            raise click.UsageError(
                f"Please specify a specific method of {cls._get_name()} to run, e.g. `modal run foo.py::MyClass.bar`"  # noqa: E501
            )

    partial_function = partial_functions[method_name]
    raw_f = partial_function._get_raw_f()
    sig_without_self = _get_signature(functools.partial(raw_f, None))
    fun_signature = _get_cli_runnable_signature(sig_without_self, safe_get_type_hints(raw_f))

    # TODO(erikbern): assert there's no overlap?
    parameters = dict(**cls_signature.parameters, **fun_signature.parameters)  # Pool all arguments

    def _inner(args, click_kwargs):
        # unpool class and method arguments
        # TODO(erikbern): this code is a bit hacky
        cls_kwargs = {k: click_kwargs[k] for k in cls_signature.parameters}
        fun_kwargs = {k: click_kwargs[k] for k in fun_signature.parameters}

        instance = cls(**cls_kwargs)
        method: Function = getattr(instance, method_name)
        if ctx.obj["detach"]:
            return method.spawn(*args, **fun_kwargs).get()
        else:
            return method.remote(*args, **fun_kwargs)

    f = _make_click_function(app, fun_signature, _inner)
    with_click_options = _add_click_options(f, parameters)

    if fun_signature.has_variadic_args:
        return click.command(context_settings={"ignore_unknown_options": True, "allow_extra_args": True})(
            with_click_options
        )
    else:
        return click.command(with_click_options)


def _get_click_command_for_local_entrypoint(app: App, entrypoint: LocalEntrypoint):
    func = entrypoint.info.raw_f
    isasync = inspect.iscoroutinefunction(func)

    signature = _get_cli_runnable_signature(_get_signature(func), safe_get_type_hints(func))

    @click.pass_context
    def f(ctx, *args, **kwargs):
        if ctx.obj["detach"]:
            print(  # noqa: T201
                "Note that running a local entrypoint in detached mode only keeps the last "
                "triggered Modal function alive after the parent process has been killed or disconnected."
            )

        if signature.has_variadic_args:
            assert len(args) == 0 and len(kwargs) == 0
            args = ctx.args

        _validate_interactive_quiet_params(ctx)

        show_progress: bool = ctx.obj["show_progress"]
        show_timestamps: bool = ctx.obj["show_timestamps"]
        with enable_output(show_progress, show_timestamps=show_timestamps):
            with run_app(
                app,
                detach=ctx.obj["detach"],
                environment_name=ctx.obj["env"],
                interactive=ctx.obj["interactive"],
            ):
                try:
                    if isasync:
                        res = asyncio.run(func(*args, **kwargs))
                    else:
                        res = func(*args, **kwargs)
                except Exception as exc:
                    raise _CliUserExecutionError(inspect.getsourcefile(func)) from exc

            if result_path := ctx.obj["result_path"]:
                _write_local_result(result_path, res)

    with_click_options = _add_click_options(f, signature.parameters)

    if signature.has_variadic_args:
        return click.command(context_settings={"ignore_unknown_options": True, "allow_extra_args": True})(
            with_click_options
        )
    else:
        return click.command(with_click_options)


def _get_runnable_list(all_usable_commands: list[CLICommand]) -> str:
    usable_command_lines = []
    for cmd in all_usable_commands:
        cmd_names = " / ".join(cmd.names)
        usable_command_lines.append(cmd_names)

    return "\n".join(usable_command_lines)


class RunGroup(click.Group):
    def get_command(self, ctx, func_ref):
        # note: get_command here is run before the "group logic" in the `run` logic below
        # so to ensure that `env` has been globally populated before user code is loaded, it
        # needs to be handled here, and not in the `run` logic below
        ctx.ensure_object(dict)
        ctx.obj["env"] = ensure_env(ctx.params["env"])

        import_ref = parse_import_ref(func_ref, use_module_mode=ctx.params["m"])
        runnable, all_usable_commands = import_and_filter(
            import_ref, base_cmd="modal run", accept_local_entrypoint=True, accept_webhook=False
        )
        if not runnable:
            help_header = (
                "Specify a Modal Function or local entrypoint to run. E.g.\n"
                f"> modal run {import_ref.file_or_module}::my_function [..args]"
            )

            if all_usable_commands:
                help_footer = f"'{import_ref.file_or_module}' has the following functions and local entrypoints:\n"
                help_footer += _get_runnable_list(all_usable_commands)
            else:
                help_footer = f"'{import_ref.file_or_module}' has no functions or local entrypoints."

            raise ClickException(f"{help_header}\n\n{help_footer}")

        app = _get_runnable_app(runnable)

        if app.description is None:
            app.set_description(_get_clean_app_description(func_ref))

        if isinstance(runnable, LocalEntrypoint):
            click_command = _get_click_command_for_local_entrypoint(app, runnable)
        elif isinstance(runnable, Function):
            click_command = _get_click_command_for_function(app, runnable, ctx)
        elif isinstance(runnable, MethodReference):
            click_command = _get_click_command_for_cls(app, runnable, ctx)
        else:
            # This should be unreachable...
            raise ValueError(f"{runnable} is neither function, local entrypoint or class/method")
        return click_command


@click.group(
    cls=RunGroup,
    subcommand_metavar="FUNC_REF",
)
@click.option("-w", "--write-result", help="Write return value (which must be str or bytes) to this local path.")
@click.option("-q", "--quiet", is_flag=True, help="Don't show Modal progress indicators.")
@click.option("-d", "--detach", is_flag=True, help="Don't stop the app if the local process dies or disconnects.")
@click.option("-i", "--interactive", is_flag=True, help="Run the app in interactive mode.")
@click.option("-e", "--env", help=ENV_OPTION_HELP, default=None)
@click.option("-m", is_flag=True, help="Interpret argument as a Python module path instead of a file/script path")
@click.option("--timestamps", is_flag=True, help="Show timestamps for each log line.")
@click.pass_context
def run(ctx, write_result, detach, quiet, interactive, env, m, timestamps):
    """Run a Modal function or local entrypoint.

    `FUNC_REF` should be of the format `{file or module}::{function name}`.
    Alternatively, you can refer to the function via the app:

    `{file or module}::{app variable name}.{function name}`

    **Examples:**

    To run the hello_world function (or local entrypoint) in my_app.py:

    ```
    modal run my_app.py::hello_world
    ```

    If your module only has a single app and your app has a
    single local entrypoint (or single function), you can omit the app and
    function parts:

    ```
    modal run my_app.py
    ```

    Instead of pointing to a file, you can also use the Python module path, which
    by default will ensure that your remote functions will use the same module
    names as they do locally.

    ```
    modal run -m my_project.my_app
    ```
    """
    ctx.ensure_object(dict)
    ctx.obj["result_path"] = write_result
    ctx.obj["detach"] = detach  # if subcommand would be a click command...
    ctx.obj["show_progress"] = False if quiet else True
    ctx.obj["interactive"] = interactive
    ctx.obj["show_timestamps"] = timestamps


def deploy(
    app_ref: str = typer.Argument(..., help="Path to a Python file with an app to deploy"),
    name: str = typer.Option("", help="Name of the deployment."),
    env: str = ENV_OPTION,
    stream_logs: bool = typer.Option(False, help="Stream logs from the app upon deployment."),
    tag: str = typer.Option("", help="Tag the deployment with a version."),
    use_module_mode: bool = typer.Option(
        False, "-m", help="Interpret argument as a Python module path instead of a file/script path"
    ),
    timestamps: bool = typer.Option(False, "--timestamps", help="Show timestamps for each log line."),
):
    """Deploy a Modal application.

    **Usage:**
    modal deploy my_script.py
    modal deploy -m my_package.my_mod
    """
    # this ensures that lookups without environment specification use the same env as specified
    env = ensure_env(env)

    import_ref = parse_import_ref(app_ref, use_module_mode=use_module_mode)
    app = import_app_from_ref(import_ref, base_cmd="modal deploy")

    name = name or app.name or ""
    if not name:
        raise ExecutionError(
            "You need to either supply an explicit deployment name on the command line "
            "or have a name set on the App.\n"
            "\n"
            "Examples:\n"
            'app = modal.App("some-name")\n'
            "modal deploy ... --name=some-name"
        )

    with enable_output(show_timestamps=timestamps):
        res = deploy_app(app, name=name, environment_name=env or "", tag=tag)

    if stream_logs:
        stream_app_logs(app_id=res.app_id, app_logs_url=res.app_logs_url, show_timestamps=timestamps)


def serve(
    app_ref: str = typer.Argument(..., help="Path to a Python file with an app."),
    timeout: Optional[float] = None,
    env: str = ENV_OPTION,
    use_module_mode: bool = typer.Option(
        False, "-m", help="Interpret argument as a Python module path instead of a file/script path"
    ),
    timestamps: bool = typer.Option(False, "--timestamps", help="Show timestamps for each log line."),
):
    """Run a web endpoint(s) associated with a Modal app and hot-reload code.

    **Examples:**

    ```
    modal serve hello_world.py
    ```

    Modal-generated URLs will have a `-dev` suffix appended to them when running with `modal serve`.
    To customize this suffix (i.e., to avoid collisions with other users in your workspace who are
    concurrently serving the App), you can set the `dev_suffix` in your `.modal.toml` file or the
    `MODAL_DEV_SUFFIX` environment variable.

    """
    env = ensure_env(env)
    import_ref = parse_import_ref(app_ref, use_module_mode=use_module_mode)
    app = import_app_from_ref(import_ref, base_cmd="modal serve")
    if app.description is None:
        app.set_description(_get_clean_app_description(app_ref))

    with enable_output(show_timestamps=timestamps):
        with serve_app(app, import_ref, environment_name=env):
            if timeout is None:
                timeout = config["serve_timeout"]
            if timeout is None:
                timeout = float("inf")
            while timeout > 0:
                t = min(timeout, 3600)
                time.sleep(t)
                timeout -= t
