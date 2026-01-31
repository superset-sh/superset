# Copyright Modal Labs 2022
import posixpath
import typing
from collections.abc import Mapping, Sequence
from pathlib import PurePath, PurePosixPath
from typing import Optional, Union

from typing_extensions import TypeGuard

from ..cloud_bucket_mount import _CloudBucketMount
from ..exception import InvalidError
from ..network_file_system import _NetworkFileSystem
from ..volume import _Volume

T = typing.TypeVar("T", bound=Union[_Volume, _NetworkFileSystem, _CloudBucketMount])


def validate_mount_points(
    display_name: str,
    volume_likes: Mapping[Union[str, PurePosixPath], T],
) -> list[tuple[str, T]]:
    """Mount point path validation for volumes and network file systems."""

    if not isinstance(volume_likes, dict):
        raise InvalidError(
            f"`volume_likes` should be a dict[str | PurePosixPath, {display_name}], got {type(volume_likes)} instead"
        )

    validated = []
    for path, vol in volume_likes.items():
        path = PurePath(path).as_posix()
        abs_path = posixpath.abspath(path)

        if path != abs_path:
            raise InvalidError(f"{display_name} {path} must be a canonical, absolute path.")
        elif abs_path == "/":
            raise InvalidError(f"{display_name} {path} cannot be mounted into root directory.")
        elif abs_path == "/root":
            raise InvalidError(f"{display_name} {path} cannot be mounted at '/root'.")
        elif abs_path == "/tmp":
            raise InvalidError(f"{display_name} {path} cannot be mounted at '/tmp'.")
        validated.append((path, vol))
    return validated


def validate_network_file_systems(
    network_file_systems: Mapping[Union[str, PurePosixPath], _NetworkFileSystem],
):
    validated_network_file_systems = validate_mount_points("NetworkFileSystem", network_file_systems)

    for path, network_file_system in validated_network_file_systems:
        if not isinstance(network_file_system, (_NetworkFileSystem)):
            raise InvalidError(
                f"Object of type {type(network_file_system)} mounted at '{path}' "
                + "is not useable as a network file system."
            )

    return validated_network_file_systems


def validate_volumes(
    volumes: Mapping[Union[str, PurePosixPath], Union[_Volume, _CloudBucketMount]],
) -> Sequence[tuple[str, Union[_Volume, _CloudBucketMount]]]:
    validated_volumes = validate_mount_points("Volume", volumes)
    # We don't support mounting a modal.Volume in more than one location,
    # but the same CloudBucketMount object can be used in more than one location.
    volume_to_paths: dict[_Volume, list[str]] = {}
    for path, volume in validated_volumes:
        if not isinstance(volume, (_Volume, _CloudBucketMount)):
            raise InvalidError(f"Object of type {type(volume)} mounted at '{path}' is not usable as a volume.")
        elif isinstance(volume, (_Volume)):
            volume_to_paths.setdefault(volume, []).append(path)
    for paths in volume_to_paths.values():
        if len(paths) > 1:
            conflicting = ", ".join(paths)
            raise InvalidError(
                f"The same Volume cannot be mounted in multiple locations for the same function: {conflicting}"
            )

    return validated_volumes


def validate_only_modal_volumes(
    volumes: Optional[Optional[dict[Union[str, PurePosixPath], _Volume]]],
    caller_name: str,
) -> Sequence[tuple[str, _Volume]]:
    """Validate all volumes are `modal.Volume`."""
    if volumes is None:
        return []

    validated_volumes = validate_volumes(volumes)

    # Although the typing forbids `_CloudBucketMount` for type checking, one can still pass a `_CloudBucketMount`
    # during runtime, so we'll check the type here.
    def all_modal_volumes(
        vols: Sequence[tuple[str, Union[_Volume, _CloudBucketMount]]],
    ) -> TypeGuard[Sequence[tuple[str, _Volume]]]:
        return all(isinstance(v, _Volume) for _, v in vols)

    if not all_modal_volumes(validated_volumes):
        raise InvalidError(f"{caller_name} only supports volumes that are modal.Volume")

    return validated_volumes
