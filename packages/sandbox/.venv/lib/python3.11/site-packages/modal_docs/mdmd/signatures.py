# Copyright Modal Labs 2023
import ast
import inspect
import re
import textwrap
import warnings

from synchronicity.synchronizer import FunctionWithAio


def _signature_from_ast(func) -> tuple[str, str]:
    """Get function signature, including decorators and comments, from source code

    Traverses functools.wraps-wrappings to get source of underlying function.

    Has the advantage over inspect.signature that it can get decorators, default arguments and comments verbatim
    from the function definition.
    """
    src = inspect.getsource(func)
    src = textwrap.dedent(src)

    def get_source_segment(src, fromline, fromcol, toline, tocol) -> str:
        lines = src.split("\n")
        lines = lines[fromline - 1 : toline]
        lines[-1] = lines[-1][:tocol]
        lines[0] = lines[0][fromcol:]
        return "\n".join(lines)

    tree = ast.parse(src)
    func_def = list(ast.iter_child_nodes(tree))[0]
    assert isinstance(func_def, (ast.FunctionDef, ast.AsyncFunctionDef))
    decorator_starts = [(item.lineno, item.col_offset - 1) for item in func_def.decorator_list]
    declaration_start = min([(func_def.lineno, func_def.col_offset)] + decorator_starts)
    body_start = min((item.lineno, item.col_offset) for item in func_def.body)

    return (
        func_def.name,
        get_source_segment(src, declaration_start[0], declaration_start[1], body_start[0], body_start[1] - 1).strip(),
    )


def get_signature(name, callable) -> str:
    """A problem with using *only* this method is that the wrapping method signature will not be respected.
    TODO: use source parsing *only* to extract default arguments, comments (and possibly decorators) and "merge"
          that definition with the outer-most definition."""

    if not (inspect.isfunction(callable) or inspect.ismethod(callable) or isinstance(callable, FunctionWithAio)):
        assert hasattr(callable, "__call__")
        callable = callable.__call__

    try:
        original_name, definition_source = _signature_from_ast(callable)
    except Exception:
        warnings.warn(f"Could not get source signature for {name}. Using fallback.")
        original_name = name
        definition_source = f"def {name}{inspect.signature(callable)}"

    if original_name != name:
        # ugly name and definition replacement hack when needed
        definition_source = definition_source.replace(f"def {original_name}", f"def {name}")

    if (
        "async def" in definition_source
        and not inspect.iscoroutinefunction(callable)
        and not inspect.isasyncgenfunction(callable)
    ):
        # hack to "reset" signature to a blocking one if the underlying source definition is async
        # but the wrapper function isn't (like when synchronicity wraps an async function as a blocking one)
        definition_source = definition_source.replace("async def", "def")
        definition_source = definition_source.replace("asynccontextmanager", "contextmanager")
        definition_source = definition_source.replace("AsyncIterator", "Iterator")

    # remove any synchronicity-internal decorators
    definition_source, _ = re.subn(r"^\s*@synchronizer\..*\n", "", definition_source)

    return definition_source
