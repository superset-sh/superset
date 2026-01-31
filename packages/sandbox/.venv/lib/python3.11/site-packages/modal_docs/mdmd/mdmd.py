# Copyright Modal Labs 2023
"""mdmd - MoDal MarkDown"""

import inspect
import warnings
from enum import Enum, EnumMeta
from types import ModuleType
from typing import Callable, Optional

import synchronicity.synchronizer

from .signatures import get_signature


def format_docstring(docstring: Optional[str]) -> str:
    if docstring is None:
        docstring = ""
    else:
        docstring = inspect.cleandoc(docstring)

    docstring = "\n".join(l for l in docstring.split("\n") if "mdmd:line-hidden" not in l)

    if docstring and not docstring.endswith("\n"):
        docstring += "\n"

    return docstring


def function_str(name: str, func) -> str:
    signature = get_signature(name, func)
    signature = "\n".join(l for l in signature.split("\n") if "mdmd:line-hidden" not in l)
    decl = f"""```python
{signature}
```\n\n"""
    docstring = format_docstring(func.__doc__)
    return decl + docstring


def class_str(name, obj, title_level="##"):
    def qual_name(cls):
        if cls.__module__ == "builtins":
            return cls.__name__
        return f"{cls.__module__}.{cls.__name__}"

    bases = [qual_name(b) for b in obj.__bases__]
    bases_str = f"({', '.join(bases)})" if bases else ""
    decl = f"""```python
class {name}{bases_str}
```\n\n"""
    parts = [decl]
    docstring = format_docstring(obj.__doc__)

    if isinstance(obj, EnumMeta) and not docstring:
        # Python 3.11 removed the docstring from enums
        docstring = "An enumeration.\n"

    if docstring:
        parts.append(docstring + "\n")

    if isinstance(obj, EnumMeta):
        enum_vals = "\n".join(f"* `{k}`" for k in obj.__members__.keys())
        parts.append(f"The possible values are:\n\n{enum_vals}\n")

    else:
        init = inspect.unwrap(obj.__init__)

        if (inspect.isfunction(init) or inspect.ismethod(init)) and not object_is_private("constructor", init):
            parts.append(function_str("__init__", init))

    member_title_level = title_level + "#"

    entries = {}

    def rec_update_attributes(cls):
        # first bases, then class itself
        for base_cls in cls.__bases__:
            rec_update_attributes(base_cls)
        entries.update(cls.__dict__)

    rec_update_attributes(obj)

    for member_name, member in entries.items():
        if isinstance(member, synchronicity.synchronizer.classproperty):
            member_obj = getattr(obj, member_name)
            if not inspect.isclass(member_obj):
                # A little hacky; right now we are only using classproperty for the .objects manager classes
                # I'm adding this constraint to avoid refactoring this to support more recursive calling
                print(f"* Skipping {member_name}; we currnetly assume classproperty is a class")
                continue
            parts.append(f"{member_title_level} {member_name}\n\n")
            parts.append(class_str(member_name, member_obj, title_level=title_level + "#"))
            continue
        elif isinstance(member, classmethod) or isinstance(member, staticmethod):
            # get the original function definition instead of the descriptor object
            member = getattr(obj, member_name)
        elif isinstance(member, property):
            member = member.fget
        elif isinstance(member, (synchronicity.synchronizer.FunctionWithAio, synchronicity.synchronizer.MethodWithAio)):
            member = member._func

        if object_is_private(member_name, member):
            continue

        if callable(member):
            parts.append(f"{member_title_level} {member_name}\n\n")
            parts.append(function_str(member_name, member))

    return "".join(parts)


def module_str(header, module, title_level="#", filter_items: Callable[[ModuleType, str], bool] = None):
    header = [f"{title_level} {header}\n\n"]
    docstring = format_docstring(module.__doc__)
    if docstring:
        header.append(docstring + "\n")

    object_docs = []
    member_title_level = title_level + "#"
    for qual_name, name, item in module_items(module, filter_items):
        try:
            if hasattr(item, "__wrapped__"):
                item = item.__wrapped__
        except KeyError:
            pass
        except:
            print("failed on", qual_name, name, item)
            raise
        if inspect.isclass(item):
            classdoc = class_str(name, item, title_level=member_title_level)
            object_docs.append(f"{member_title_level} {qual_name}\n\n")
            object_docs.append(classdoc)
        elif callable(item):
            funcdoc = function_str(name, item)
            object_docs.append(f"{member_title_level} {qual_name}\n\n")
            object_docs.append(funcdoc)
        else:
            item_doc = getattr(module, f"__doc__{name}", None)
            if item_doc:
                # variable documentation
                object_docs.append(f"{member_title_level} {qual_name}\n\n")
                object_docs.append(item_doc)
            else:
                warnings.warn(f"Not sure how to document: {name} ({item}")

    if object_docs:
        return "".join(header + object_docs)
    return ""


def object_is_private(name, obj):
    docstring = inspect.getdoc(obj)
    if docstring is None:
        docstring = ""
    module = getattr(obj, "__module__", None)  # obj is class
    if not module:
        cls = getattr(obj, "__class__", None)  # obj is instance
        if cls:
            module = getattr(cls, "__module__", None)
    if module == "builtins":
        return True

    if docstring.lstrip().startswith("mdmd:hidden") or name.startswith("_"):
        return True

    return False


def default_filter(module, item_name):
    """Include non-private objects defined in the module itself"""
    item = getattr(module, item_name)
    if object_is_private(item_name, item) or inspect.ismodule(item):
        return False
    member_module = getattr(item, "__module__", type(item).__module__)
    return member_module == module.__name__


def package_filter(module_prefix: str):
    """Include non-private objects defined in any module with the prefix `module_prefix`"""

    def return_filter(module, item_name):
        item = getattr(module, item_name)
        if object_is_private(item_name, item) or inspect.ismodule(item):
            return False
        member_module = getattr(item, "__module__", type(item).__module__)
        return member_module.startswith(module_prefix)

    return return_filter


def module_items(module, filter_items: Callable[[ModuleType, str], bool] = None):
    """Returns filtered members of module"""
    if filter_items is None:
        # default filter is to only include classes and functions declared (or whose type is declared) in the file
        filter_items = default_filter

    for member_name, member in inspect.getmembers(module):
        # only modal items
        if not filter_items(module, member_name):
            continue

        qual_name = f"{module.__name__}.{member_name}"
        yield qual_name, member_name, member


class Category(Enum):
    FUNCTION = "function"
    CLASS = "class"
    MODULE = "module"
