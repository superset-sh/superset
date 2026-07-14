import { eq, or } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useTabsStore } from "renderer/stores/tabs/store";

const NO_WORKSPACE_MATCH = "__no_workspace__";

/**
 * Sync Electric chat-session titles → tab and pane names for chat panes in the
 * given workspace. Runs once at the workspace level (not per panel/strip).
 */
export function useChatSessionTitleSync(workspaceId: string | undefined) {
	const allTabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const setTabAutoTitle = useTabsStore((s) => s.setTabAutoTitle);
	const setPaneAutoTitle = useTabsStore((s) => s.setPaneAutoTitle);

	const tabs = useMemo(
		() =>
			workspaceId
				? allTabs.filter((tab) => tab.workspaceId === workspaceId)
				: [],
		[workspaceId, allTabs],
	);

	const chatSessionTargets = useMemo(() => {
		const map = new Map<
			string,
			{ tabIds: Set<string>; paneIds: Set<string> }
		>();
		for (const pane of Object.values(panes)) {
			if (pane.type === "chat" && pane.chat?.sessionId) {
				const tab = tabs.find((t) => t.id === pane.tabId);
				if (!tab) continue;
				const sessionId = pane.chat.sessionId;
				const existing = map.get(sessionId) ?? {
					tabIds: new Set<string>(),
					paneIds: new Set<string>(),
				};
				existing.tabIds.add(tab.id);
				existing.paneIds.add(pane.id);
				map.set(sessionId, existing);
			}
		}
		return map;
	}, [panes, tabs]);
	const targetSessionIds = useMemo(
		() => Array.from(chatSessionTargets.keys()),
		[chatSessionTargets],
	);
	const targetSessionIdsKey = targetSessionIds.join(",");
	const shouldSyncChatTitles =
		Boolean(workspaceId) && targetSessionIds.length > 0;

	const collections = useCollections();
	const { data: chatSessions } = useLiveQuery(
		(q) =>
			q
				.from({ chatSessions: collections.chatSessions })
				.where(({ chatSessions }) => {
					if (!shouldSyncChatTitles) {
						return eq(chatSessions.workspaceId, NO_WORKSPACE_MATCH);
					}
					const [firstSessionId, ...restSessionIds] = targetSessionIds;
					if (!firstSessionId) {
						return eq(chatSessions.workspaceId, NO_WORKSPACE_MATCH);
					}
					let predicate = eq(chatSessions.id, firstSessionId);
					for (const sessionId of restSessionIds) {
						predicate = or(predicate, eq(chatSessions.id, sessionId));
					}
					return predicate;
				})
				.select(({ chatSessions }) => ({
					id: chatSessions.id,
					title: chatSessions.title,
					workspaceId: chatSessions.workspaceId,
				})),
		[collections.chatSessions, shouldSyncChatTitles, targetSessionIdsKey],
	);

	useEffect(() => {
		if (!shouldSyncChatTitles) return;
		if (!chatSessions) return;
		for (const session of chatSessions) {
			const target = chatSessionTargets.get(session.id);
			const title = session.title?.trim();
			if (!target || !title) continue;
			for (const tabId of target.tabIds) {
				setTabAutoTitle(tabId, title);
			}
			for (const paneId of target.paneIds) {
				setPaneAutoTitle(paneId, title);
			}
		}
	}, [
		chatSessions,
		chatSessionTargets,
		setPaneAutoTitle,
		setTabAutoTitle,
		shouldSyncChatTitles,
	]);
}
