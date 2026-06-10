import type { LifecycleEvent } from "@superset/chat/server/trpc";
import { ChatRuntimeService } from "@superset/chat/server/trpc";
import { appState } from "main/lib/app-state";
import { getMainApiUrl } from "main/lib/desktop-runtime-flags";
import { notificationsEmitter } from "main/lib/notifications/server";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { loadToken } from "../auth/utils/auth-functions";

function resolveNotificationIdsFromSession(sessionId: string): {
	paneId?: string;
	tabId?: string;
	workspaceId?: string;
} {
	try {
		const tabsState = appState.data.tabsState;
		if (!tabsState) return {};

		const paneId = Object.entries(tabsState.panes ?? {}).find(
			([_paneId, pane]) => pane.chat?.sessionId === sessionId,
		)?.[0];
		if (!paneId) return {};

		const pane = tabsState.panes?.[paneId];
		const tabId = pane?.tabId;
		const tab = tabId
			? tabsState.tabs?.find((candidate) => candidate.id === tabId)
			: undefined;

		return {
			paneId,
			tabId,
			workspaceId: tab?.workspaceId,
		};
	} catch {
		// App state not initialized yet
	}
	return {};
}

function handleLifecycleEvent(event: LifecycleEvent): void {
	const ids = resolveNotificationIdsFromSession(event.sessionId);
	notificationsEmitter.emit(NOTIFICATION_EVENTS.AGENT_LIFECYCLE, {
		...ids,
		sessionId: event.sessionId,
		eventType: event.eventType,
	});
}

let service: ChatRuntimeService | null = null;

function getService(): ChatRuntimeService {
	service ??= new ChatRuntimeService({
		headers: async (): Promise<Record<string, string>> => {
			const { token } = await loadToken();
			if (token) return { Authorization: `Bearer ${token}` };
			return {};
		},
		apiUrl: getMainApiUrl(),
		onLifecycleEvent: handleLifecycleEvent,
	});
	return service;
}

export const createChatRuntimeServiceRouter = () => getService().createRouter();

export type ChatRuntimeServiceDesktopRouter = ReturnType<
	typeof createChatRuntimeServiceRouter
>;
