# Copyright Modal Labs 2023
import inspect
import sys
from pathlib import Path
from typing import Optional, cast

from click import Command, Context, Group

from modal.cli.entry_point import entrypoint_cli


# Adapted from typer_cli, since it's incompatible with the latest version of typer
# (see https://github.com/tiangolo/typer-cli/issues/50)
def get_docs_for_click(
    obj: Command,
    ctx: Context,
    *,
    indent: int = 0,
    name: str = "",
    call_prefix: str = "",
) -> str:
    docs = "#" * (1 + indent)
    command_name = name or obj.name
    if call_prefix:
        command_name = f"{call_prefix} {command_name}"
    title = f"`{command_name}`" if command_name else "CLI"
    docs += f" {title}\n\n"
    if obj.help:
        docs += f"{inspect.cleandoc(obj.help)}\n\n"
    usage_pieces = obj.collect_usage_pieces(ctx)
    if usage_pieces:
        docs += "**Usage**:\n\n"
        docs += "```shell\n"
        if command_name:
            docs += f"{command_name} "
        docs += f"{' '.join(usage_pieces)}\n"
        docs += "```\n\n"
    args = []
    opts = []
    for param in obj.get_params(ctx):
        rv = param.get_help_record(ctx)
        if rv is not None:
            if getattr(param, "hidden", False):
                continue
            if param.param_type_name == "argument":
                args.append(rv)
            elif param.param_type_name == "option":
                opts.append(rv)
    if args:
        docs += "**Arguments**:\n\n"
        for arg_name, arg_help in args:
            docs += f"* `{arg_name}`"
            if arg_help:
                docs += f": {arg_help}"
            docs += "\n"
        docs += "\n"
    if opts:
        docs += "**Options**:\n\n"
        for opt_name, opt_help in opts:
            docs += f"* `{opt_name}`"
            if opt_help:
                docs += f": {opt_help}"
            docs += "\n"
        docs += "\n"
    if obj.epilog:
        docs += f"{obj.epilog}\n\n"
    if isinstance(obj, Group):
        group: Group = cast(Group, obj)
        commands = group.list_commands(ctx)
        if commands:
            docs += "**Commands**:\n\n"
            for command in commands:
                command_obj = group.get_command(ctx, command)
                assert command_obj
                if command_obj.hidden:
                    continue
                docs += f"* `{command_obj.name}`"
                command_help = command_obj.get_short_help_str(limit=250)
                if command_help:
                    docs += f": {command_help}"
                docs += "\n"
            docs += "\n"
        for command in commands:
            command_obj = group.get_command(ctx, command)
            if command_obj.hidden:
                continue
            assert command_obj
            use_prefix = ""
            if command_name:
                use_prefix += f"{command_name}"
            docs += get_docs_for_click(obj=command_obj, ctx=ctx, indent=indent + 1, call_prefix=use_prefix)
    return docs


def run(output_dirname: Optional[str]) -> None:
    entrypoint: Group = cast(Group, entrypoint_cli)
    ctx = Context(entrypoint)
    commands = entrypoint.list_commands(ctx)

    for command in commands:
        command_obj = entrypoint.get_command(ctx, command)
        if command_obj.hidden:
            continue
        docs = get_docs_for_click(obj=command_obj, ctx=ctx, call_prefix="modal")

        if output_dirname:
            output_dir = Path(output_dirname)
            output_dir.mkdir(parents=True, exist_ok=True)
            output_file = output_dir / f"{command}.md"
            print("Writing to", output_file)
            output_file.write_text(docs)
        else:
            print(docs)


if __name__ == "__main__":
    run(None if len(sys.argv) <= 1 else sys.argv[1])
