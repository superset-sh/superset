import {
	createChatServiceRouter as buildRouter,
	ChatService,
} from "@superset/chat/host";
import { env } from "main/env.main";
import { appState } from "main/lib/app-state";
import { getHashedDeviceId } from "main/lib/device-info";
import { notificationsEmitter } from "main/lib/notifications/server";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { loadToken } from "../auth/utils/auth-functions";

function resolveLifecycleTargets(sessionId: string): Array<{
	paneId: string;
	tabId: string;
	workspaceId: string;
}> {
	const tabsState = appState.data.tabsState;
	if (!tabsState) return [];

	const tabWorkspaceById = new Map(
		tabsState.tabs.map((tab) => [tab.id, tab.workspaceId]),
	);
	const targets: Array<{
		paneId: string;
		tabId: string;
		workspaceId: string;
	}> = [];

	for (const [paneId, pane] of Object.entries(tabsState.panes)) {
		if (pane.type !== "chat") continue;
		if (pane.chat?.sessionId !== sessionId) continue;

		const workspaceId = tabWorkspaceById.get(pane.tabId);
		if (!workspaceId) continue;

		targets.push({
			paneId,
			tabId: pane.tabId,
			workspaceId,
		});
	}

	return targets;
}

const service = new ChatService({
	deviceId: getHashedDeviceId(),
	apiUrl: env.NEXT_PUBLIC_API_URL,
	getHeaders: async () => {
		const { token } = await loadToken();
		const headers: Record<string, string> = {};
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}
		return headers;
	},
	onLifecycleEvent: ({ sessionId, eventType }) => {
		const targets = resolveLifecycleTargets(sessionId);
		if (targets.length === 0) return;

		for (const target of targets) {
			notificationsEmitter.emit(NOTIFICATION_EVENTS.AGENT_LIFECYCLE, {
				...target,
				eventType,
			});
		}
	},
});

export const createChatServiceRouter = () => buildRouter(service);

export type ChatServiceDesktopRouter = ReturnType<
	typeof createChatServiceRouter
>;
