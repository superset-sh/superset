import type { RendererContext } from "@superset/panes";
import { useCallback } from "react";
import { tierFor, useUrlLinkAction } from "renderer/lib/clickPolicy";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { runUrlLinkAction } from "../../../../utils/runTerminalLinkAction";
import type { OpenPage } from "../../../ChatSession/providers/ChatPaneActionsProvider";

/**
 * A click on a page card in the chat. Modifiers follow the page link click
 * policy; an unbound plain click opens the page in a pane, because a card that
 * ignores a plain click reads as broken. An unbound modifier tier does nothing.
 */
export function useOpenChatPage(
	store: RendererContext<PaneViewerData>["store"],
): OpenPage {
	const getUrlAction = useUrlLinkAction("2-tier");
	return useCallback(
		(url, event) => {
			const action =
				getUrlAction(event, url) ??
				(tierFor(event, "2-tier") === "plain" ? "pane" : null);
			if (action) runUrlLinkAction({ store }, url, action);
		},
		[getUrlAction, store],
	);
}
