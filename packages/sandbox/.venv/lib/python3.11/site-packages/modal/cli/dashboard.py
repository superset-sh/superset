# Copyright Modal Labs 2026
from typing import Optional

import typer

from modal._output import make_console
from modal._utils.async_utils import synchronizer
from modal._utils.browser_utils import open_url_and_display
from modal.client import _Client
from modal.config import config
from modal_proto import api_pb2


@synchronizer.create_blocking
async def dashboard(
    object_id: Optional[str] = typer.Argument(None, help="Open a view for a specific object."),
):
    """Open the Modal Dashboard in a web browser."""
    console = make_console()

    if object_id:
        url = f"https://modal.com/id/{object_id}"
    else:
        env = config.get("environment")
        request = api_pb2.WorkspaceDashboardUrlRequest(environment_name=env)
        client = await _Client.from_env()
        response = await client.stub.WorkspaceDashboardUrlGet(request)
        url = response.url

    open_url_and_display(url, "dashboard", console)
