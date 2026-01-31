# Copyright Modal Labs 2022
import importlib.util
import typing
from importlib.metadata import PackageNotFoundError, files
from pathlib import Path

from ..exception import ModuleNotMountable


def get_file_formats(module):
    try:
        module_files = files(module)
        if not module_files:
            return []

        endings = [str(p).split(".")[-1] for p in module_files if "." in str(p)]
        return list(set(endings))
    except PackageNotFoundError:
        return []


BINARY_FORMATS = ["so", "S", "s", "asm"]  # TODO


def get_module_mount_info(module_name: str) -> typing.Sequence[tuple[bool, Path]]:
    """Returns a list of tuples [(is_dir, path)] describing how to mount a given module."""
    file_formats = get_file_formats(module_name)
    if set(BINARY_FORMATS) & set(file_formats):
        raise ModuleNotMountable(f"{module_name} can't be mounted because it contains binary file(s).")
    try:
        spec = importlib.util.find_spec(module_name)
    except Exception as exc:
        raise ModuleNotMountable(str(exc))

    entries = []
    if spec is None:
        raise ModuleNotMountable(f"{module_name} has no spec - might not be installed?")
    elif spec.submodule_search_locations:
        entries = [(True, Path(path)) for path in spec.submodule_search_locations if Path(path).exists()]
    else:
        # Individual file
        filename = spec.origin
        if filename is not None and Path(filename).exists():
            entries = [(False, Path(filename))]
    if not entries:
        raise ModuleNotMountable(f"{module_name} has no mountable paths")
    return entries


def parse_major_minor_version(version_string: str) -> tuple[int, int]:
    parts = version_string.split(".")
    if len(parts) < 2:
        raise ValueError("version_string must have at least an 'X.Y' format")
    try:
        major = int(parts[0])
        minor = int(parts[1])
    except ValueError:
        raise ValueError("version_string must have at least an 'X.Y' format with integral major/minor values")

    return major, minor
