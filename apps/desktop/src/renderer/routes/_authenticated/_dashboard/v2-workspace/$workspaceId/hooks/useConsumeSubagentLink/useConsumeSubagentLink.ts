import { useEffect, useRef } from "react";
import type { SubagentLinkParams } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { ConsumeSearch, SubagentPaneData } from "../../types";

interface UseConsumeSubagentLinkArgs {
	openSubagentPane: (data: SubagentPaneData) => void;
	isLayoutReady: boolean;
	link: SubagentLinkParams | undefined;
	focusRequestId: string | undefined;
	consumeSearch: ConsumeSearch;
}

/**
 * Opens the subagent transcript pane named by the workspace's search params,
 * the way the sidebar's agents chip deep-links into a workspace it cannot
 * reach the pane store of. Each request id is consumed once so a re-render
 * does not reopen the pane.
 */
export function useConsumeSubagentLink({
	openSubagentPane,
	isLayoutReady,
	link,
	focusRequestId,
	consumeSearch,
}: UseConsumeSubagentLinkArgs): void {
	const consumedRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		if (!isLayoutReady || !link) return;
		const key = `${link.terminalId}:${link.subagentId}:${focusRequestId ?? ""}`;
		if (consumedRef.current.has(key)) return;
		consumedRef.current.add(key);
		openSubagentPane(link);
		consumeSearch([
			"subagentTerminalId",
			"subagentId",
			"subagentAgentId",
			"subagentType",
		]);
	}, [openSubagentPane, isLayoutReady, link, focusRequestId, consumeSearch]);
}
