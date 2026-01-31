# Copyright Modal Labs 2022
import sys

from ._output import make_console
from ._traceback import reduce_traceback_to_user_code
from .cli._traceback import highlight_modal_warnings, setup_rich_traceback
from .cli.entry_point import entrypoint_cli
from .cli.import_refs import _CliUserExecutionError
from .config import config


def main():
    # Setup rich tracebacks, but only on user's end, when using the Modal CLI.
    setup_rich_traceback()
    highlight_modal_warnings()

    try:
        entrypoint_cli()

    except _CliUserExecutionError as exc:
        if config.get("traceback"):
            raise

        assert exc.__cause__  # We should always raise this class from another error
        tb = reduce_traceback_to_user_code(exc.__cause__.__traceback__, exc.user_source)
        sys.excepthook(type(exc.__cause__), exc.__cause__, tb)
        sys.exit(1)

    except Exception as exc:
        if (
            # User has asked to alway see full tracebacks
            config.get("traceback")
            # The exception message is empty, so we need to provide _some_ actionable information
            or not str(exc)
        ):
            raise

        from rich.markup import escape
        from rich.panel import Panel

        title = "Error"
        content = str(exc)
        if notes := getattr(exc, "__notes__", []):
            content = f"{content}\n\nNote: {' '.join(notes)}"

        console = make_console(stderr=True)
        panel = Panel(escape(content), title=title, title_align="left", border_style="red")
        console.print(panel, highlight=False)
        sys.exit(1)


if __name__ == "__main__":
    main()
