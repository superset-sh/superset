import type {
	HookCallbackMatcher,
	HookEvent,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

export const notificationSchema = z.object({
	port: z.number(),
	paneId: z.string().optional(),
	tabId: z.string().optional(),
	workspaceId: z.string().optional(),
	env: z.string().optional(),
});

export type NotificationContext = z.infer<typeof notificationSchema>;

export function buildNotificationHooks({
	notification,
}: {
	notification: NotificationContext;
}): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
	const baseUrl = `http://localhost:${notification.port}/hook/complete`;

	const buildUrl = (eventType: string): string => {
		const params = new URLSearchParams({ eventType });
		if (notification.paneId) params.set("paneId", notification.paneId);
		if (notification.tabId) params.set("tabId", notification.tabId);
		if (notification.workspaceId)
			params.set("workspaceId", notification.workspaceId);
		if (notification.env) params.set("env", notification.env);
		return `${baseUrl}?${params.toString()}`;
	};

	const createHookMatcher = (eventType: string): HookCallbackMatcher => ({
		hooks: [
			async () => {
				try {
					await fetch(buildUrl(eventType));
				} catch (err) {
					console.warn(
						`[notification-hooks] Failed to notify ${eventType}:`,
						err,
					);
				}
				return { continue: true };
			},
		],
	});

	return {
		UserPromptSubmit: [createHookMatcher("UserPromptSubmit")],
		Stop: [createHookMatcher("Stop")],
	};
}
