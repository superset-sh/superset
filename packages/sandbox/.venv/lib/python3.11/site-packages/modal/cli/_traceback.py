# Copyright Modal Labs 2024
"""Helper functions related to displaying tracebacks in the CLI."""

import functools
import re
import warnings
from typing import Optional

from rich.console import RenderResult, group
from rich.markup import escape
from rich.panel import Panel
from rich.syntax import Syntax
from rich.text import Text
from rich.traceback import PathHighlighter, Stack, Traceback, install

from .._output import make_console
from ..exception import DeprecationError, PendingDeprecationError, ServerWarning


@group()
def _render_stack(self, stack: Stack) -> RenderResult:
    """Patched variant of rich.Traceback._render_stack that uses the line from the modal StackSummary,
    when the file isn't available to be read locally."""

    path_highlighter = PathHighlighter()
    theme = self.theme
    code_cache: dict[str, str] = {}
    line_cache = getattr(stack, "line_cache", {})
    task_id = None

    def read_code(filename: str) -> str:
        code = code_cache.get(filename)
        if code is None:
            with open(filename, encoding="utf-8", errors="replace") as code_file:
                code = code_file.read()
            code_cache[filename] = code
        return code

    exclude_frames: Optional[range] = None
    if self.max_frames != 0:
        exclude_frames = range(
            self.max_frames // 2,
            len(stack.frames) - self.max_frames // 2,
        )

    excluded = False
    for frame_index, frame in enumerate(stack.frames):
        if exclude_frames and frame_index in exclude_frames:
            excluded = True
            continue

        if excluded:
            assert exclude_frames is not None
            yield Text(
                f"\n... {len(exclude_frames)} frames hidden ...",
                justify="center",
                style="traceback.error",
            )
            excluded = False

        first = frame_index == 0
        # Patched Modal-specific code.
        if frame.filename.startswith("<") and ":" in frame.filename:
            next_task_id, frame_filename = frame.filename.split(":", 1)
            next_task_id = next_task_id.strip("<>")
        else:
            frame_filename = frame.filename
            next_task_id = None
        suppressed = any(frame_filename.startswith(path) for path in self.suppress)

        if next_task_id != task_id:
            task_id = next_task_id
            yield ""
            yield Text(
                f"...Remote call to Modal Function ({task_id})...",
                justify="center",
                style="green",
            )

        text = Text.assemble(
            path_highlighter(Text(frame_filename, style="pygments.string")),
            (":", "pygments.text"),
            (str(frame.lineno), "pygments.number"),
            " in ",
            (frame.name, "pygments.function"),
            style="pygments.text",
        )
        if not frame_filename.startswith("<") and not first:
            yield ""

        yield text
        if not suppressed:
            try:
                code = read_code(frame_filename)
                lexer_name = self._guess_lexer(frame_filename, code)
                syntax = Syntax(
                    code,
                    lexer_name,
                    theme=theme,
                    line_numbers=True,
                    line_range=(
                        frame.lineno - self.extra_lines,
                        frame.lineno + self.extra_lines,
                    ),
                    highlight_lines={frame.lineno},
                    word_wrap=self.word_wrap,
                    code_width=88,
                    indent_guides=self.indent_guides,
                    dedent=False,
                )
                yield ""
            except Exception as error:
                # Patched Modal-specific code.
                line = line_cache.get((frame_filename, frame.lineno))
                if line:
                    try:
                        lexer_name = self._guess_lexer(frame_filename, line)
                        yield ""
                        yield Syntax(
                            line,
                            lexer_name,
                            theme=theme,
                            line_numbers=True,
                            line_range=(0, 1),
                            highlight_lines={frame.lineno},
                            word_wrap=self.word_wrap,
                            code_width=88,
                            indent_guides=self.indent_guides,
                            dedent=False,
                            start_line=frame.lineno,
                        )
                    except Exception:
                        yield Text.assemble(
                            (f"\n{error}", "traceback.error"),
                        )
                yield ""
            else:
                yield syntax


def setup_rich_traceback() -> None:
    from_exception = Traceback.from_exception

    @functools.wraps(Traceback.from_exception)
    def _from_exception(exc_type, exc_value, *args, **kwargs):
        """Patch from_exception to grab the Modal line_cache and store it with the
        Stack object, so it's available to render_stack at display time."""

        line_cache = getattr(exc_value, "__line_cache__", {})
        tb = from_exception(exc_type, exc_value, *args, **kwargs)
        for stack in tb.trace.stacks:
            stack.line_cache = line_cache  # type: ignore
        return tb

    Traceback._render_stack = _render_stack  # type: ignore
    Traceback.from_exception = _from_exception  # type: ignore

    import click
    import grpclib
    import synchronicity
    import typer

    install(suppress=[synchronicity, grpclib, click, typer], extra_lines=1)


def highlight_modal_warnings() -> None:
    """Patch the warnings module to make certain warnings more salient in the CLI."""
    base_showwarning = warnings.showwarning

    def showwarning(warning, category, filename, lineno, file=None, line=None):
        if issubclass(category, (DeprecationError, PendingDeprecationError, ServerWarning)):
            content = str(warning)
            if re.match(r"^\d{4}-\d{2}-\d{2}", content):
                date = content[:10]
                message = content[11:].strip()
            else:
                date = ""
                message = content
            try:
                with open(filename, encoding="utf-8", errors="replace") as code_file:
                    source = code_file.readlines()[lineno - 1].strip()
                message = f"{message}\n\nSource: {filename}:{lineno}\n  {source}"
            except OSError:
                # e.g., when filename is "<unknown>"; raises FileNotFoundError on posix but OSError on windows
                pass
            if issubclass(category, ServerWarning):
                title = "Modal Warning"
            else:
                title = "Modal Deprecation Warning"
            if date:
                title += f" ({date})"
            panel = Panel(
                escape(message),
                border_style="yellow",
                title=title,
                title_align="left",
            )
            make_console().print(panel)
        else:
            base_showwarning(warning, category, filename, lineno, file=None, line=None)

    warnings.showwarning = showwarning
