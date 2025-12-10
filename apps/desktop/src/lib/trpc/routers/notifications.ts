import { observable } from "@trpc/server/observable";
import {
	type AgentCompleteEvent,
	notificationsEmitter,
} from "main/lib/notifications/server";
import { publicProcedure, router } from "..";

type NotificationEvent =
	| { type: "agent-complete"; data: AgentCompleteEvent }
	| {
			type: "focus-tab";
			data: { paneId: string; tabId: string; workspaceId: string };
	  };

export const createNotificationsRouter = () => {
	return router({
		/**
		 * Subscribe to notification events (completions and focus requests).
		 */
		subscribe: publicProcedure.subscription(() => {
			return observable<NotificationEvent>((emit) => {
				const onComplete = (event: AgentCompleteEvent) => {
					emit.next({ type: "agent-complete", data: event });
				};

				const onFocusTab = (data: {
					paneId: string;
					tabId: string;
					workspaceId: string;
				}) => {
					emit.next({ type: "focus-tab", data });
				};

				notificationsEmitter.on("agent-complete", onComplete);
				notificationsEmitter.on("focus-tab", onFocusTab);

				return () => {
					notificationsEmitter.off("agent-complete", onComplete);
					notificationsEmitter.off("focus-tab", onFocusTab);
				};
			});
		}),
	});
};
