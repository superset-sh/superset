# Copyright Modal Labs 2023
import importlib
import inspect
import json
import os
import sys
import warnings
from typing import NamedTuple

from synchronicity.synchronizer import FunctionWithAio

from .mdmd.mdmd import (
    Category,
    class_str,
    default_filter,
    function_str,
    module_items,
    module_str,
    object_is_private,
    package_filter,
)


class DocItem(NamedTuple):
    label: str
    category: Category
    document: str
    in_sidebar: bool = True


def validate_doc_item(docitem: DocItem) -> DocItem:
    # Check that unwanted strings aren't leaking into our docs.
    bad_strings = [
        # Presence of a to-do inside a `DocItem` usually indicates it's been
        # placed inside a function signature definition or right underneath it, before the body.
        # Fix by moving the to-do into the body or above the signature.
        "TODO:"
    ]
    for line in docitem.document.splitlines():
        for bad_str in bad_strings:
            if bad_str in line:
                msg = f"Found unwanted string '{bad_str}' in content for item '{docitem.label}'. Problem line: {line}"
                raise ValueError(msg)
    return docitem


def run(output_dir: str = None):
    """Generate Modal docs."""
    import modal

    ordered_doc_items: list[DocItem] = []
    documented_items = set()

    def filter_non_aio(module, name):
        return not name.lower().startswith("aio")

    def filter_already_documented(module, name):
        item = getattr(module, name)
        try:
            if item in documented_items:
                return False
        except TypeError:  # unhashable stuff
            print(f"Warning: could not document item {name}: {item}:")
            return False
        documented_items.add(item)
        return True

    def modal_default_filter(module, name):
        return default_filter(module, name) and filter_non_aio(module, name) and filter_already_documented(module, name)

    def top_level_filter(module, name):
        item = getattr(module, name)
        if object_is_private(name, item) or inspect.ismodule(item):
            return False
        return package_filter("modal") and filter_already_documented(module, name) and filter_non_aio(module, name)

    base_title_level = "#"
    forced_module_docs = [
        ("modal.call_graph", "modal.call_graph"),
        ("modal.container_process", "modal.container_process"),
        ("modal.gpu", "modal.gpu"),
        ("modal.io_streams", "modal.io_streams"),
        ("modal.file_io", "modal.file_io"),
    ]
    # These aren't defined in `modal`, but should still be documented as top-level entries.
    forced_members: set[str] = set()
    # These are excluded from the sidebar, typically to 'soft release' some documentation.
    sidebar_excluded: set[str] = set()

    for title, modulepath in forced_module_docs:
        module = importlib.import_module(modulepath)
        document = module_str(modulepath, module, title_level=base_title_level, filter_items=modal_default_filter)
        if document:
            ordered_doc_items.append(
                validate_doc_item(
                    DocItem(
                        label=title,
                        category=Category.MODULE,
                        document=document,
                        in_sidebar=title not in sidebar_excluded,
                    )
                )
            )

    def f(module, member_name):
        return top_level_filter(module, member_name) or (member_name in forced_members)

    # now add all remaining top level modal.X entries
    for qual_name, item_name, item in module_items(modal, filter_items=f):
        if object_is_private(item_name, item):
            continue  # skip stuff that's part of explicit `handle_objects` above

        title = f"modal.{item_name}"
        if inspect.isclass(item):
            content = f"{base_title_level} {qual_name}\n\n" + class_str(item_name, item, base_title_level)
            category = Category.CLASS
        elif inspect.isroutine(item) or isinstance(item, FunctionWithAio):
            content = f"{base_title_level} {qual_name}\n\n" + function_str(item_name, item)
            category = Category.FUNCTION
        elif inspect.ismodule(item):
            continue  # skipping imported modules
        else:
            warnings.warn(f"Not sure how to document: {item_name} ({item})")
            continue
        ordered_doc_items.append(
            validate_doc_item(
                DocItem(
                    label=title,
                    category=category,
                    document=content,
                    in_sidebar=title not in sidebar_excluded,
                )
            )
        )
    ordered_doc_items.sort()

    for modulepath in ["modal.exception", "modal.config"]:
        module = importlib.import_module(modulepath)
        document = module_str(modulepath, module, title_level=base_title_level, filter_items=modal_default_filter)
        ordered_doc_items.append(
            DocItem(
                label=modulepath,
                category=Category.MODULE,
                document=document,
            )
        )

    # TODO: add some way of documenting our .aio sub-methods

    make_markdown_docs(
        ordered_doc_items,
        output_dir,
    )


def make_markdown_docs(items: list[DocItem], output_dir: str = None):
    def _write_file(rel_path: str, data: str):
        if output_dir is None:
            print(f"<<< {rel_path}")
            print(data)
            print(f">>> {rel_path}")
            return

        filename = os.path.join(output_dir, rel_path)
        print("Writing to", filename)
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        with open(filename, "w") as fp:
            fp.write(data)

    sidebar_items = []
    for item in items:
        if item.in_sidebar:
            sidebar_items.append(
                {
                    "label": item.label,
                    "category": item.category.value,
                }
            )
        _write_file(f"{item.label}.md", item.document)

    sidebar_data = {"items": sidebar_items}
    _write_file("sidebar.json", json.dumps(sidebar_data))


if __name__ == "__main__":
    # running this module outputs docs to stdout for inspection, useful for debugging
    run(None if len(sys.argv) <= 1 else sys.argv[1])
