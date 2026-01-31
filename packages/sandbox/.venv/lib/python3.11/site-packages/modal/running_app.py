# Copyright Modal Labs 2024
from dataclasses import dataclass, field
from typing import Optional

from google.protobuf.message import Message

from modal._utils.grpc_utils import get_proto_oneof
from modal_proto import api_pb2


@dataclass
class RunningApp:
    app_id: str
    app_page_url: Optional[str] = None
    app_logs_url: Optional[str] = None
    function_ids: dict[str, str] = field(default_factory=dict)
    class_ids: dict[str, str] = field(default_factory=dict)
    object_handle_metadata: dict[str, Optional[Message]] = field(default_factory=dict)
    interactive: bool = False


def running_app_from_layout(
    app_id: str,
    app_layout: api_pb2.AppLayout,
    app_page_url: Optional[str] = None,
) -> RunningApp:
    object_handle_metadata = {}
    for obj in app_layout.objects:
        handle_metadata: Optional[Message] = get_proto_oneof(obj, "handle_metadata_oneof")
        object_handle_metadata[obj.object_id] = handle_metadata

    return RunningApp(
        app_id,
        function_ids=dict(app_layout.function_ids),
        class_ids=dict(app_layout.class_ids),
        object_handle_metadata=object_handle_metadata,
        app_page_url=app_page_url,
    )
