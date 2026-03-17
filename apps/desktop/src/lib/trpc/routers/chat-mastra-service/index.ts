import type { LifecycleEvent } from "@superset/chat-mastra/server/trpc";
import { ChatMastraService } from "@superset/chat-mastra/server/trpc";
import { env } from "main/env.main";
import { appState } from "main/lib/app-state";
import { notificationsEmitter } from "main/lib/notifications/server";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { loadToken } from "../auth/utils/auth-functions";

function resolvePaneIdFromSession(sessionId: string): string | undefined {
	try {
		const tabsState = appState.data.tabsState;
		if (!tabsState) return undefined;
		for (const [paneId, pane] of Object.entries(tabsState.panes ?? {})) {
			if (pane.chatMastra?.sessionId === sessionId) {
				return paneId;
			}
		}
	} catch {
		// App state not initialized yet
	}
	return undefined;
}

function handleLifecycleEvent(event: LifecycleEvent): void {
	const paneId = resolvePaneIdFromSession(event.sessionId);
	notificationsEmitter.emit(NOTIFICATION_EVENTS.AGENT_LIFECYCLE, {
		paneId,
		eventType: event.eventType,
	});
}

const service = new ChatMastraService({
	headers: async (): Promise<Record<string, string>> => {
		const { token } = await loadToken();
		if (token) return { Authorization: `Bearer ${token}` };
		return {};
	},
	apiUrl: env.NEXT_PUBLIC_API_URL,
	onLifecycleEvent: handleLifecycleEvent,
});

export const createChatMastraServiceRouter = () => service.createRouter();

export type ChatMastraServiceDesktopRouter = ReturnType<
	typeof createChatMastraServiceRouter
>;
