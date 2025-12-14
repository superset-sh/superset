import { observable } from "@trpc/server/observable";
import {
	type AgentCompleteEvent,
	type NotificationIds,
	notificationsEmitter,
} from "main/lib/notifications/server";
import { publicProcedure, router } from "..";

type NotificationEvent =
	| { type: "agent-complete"; data: AgentCompleteEvent }
	| { type: "focus-tab"; data: NotificationIds };

export const createNotificationsRouter = () => {
	return router({
		subscribe: publicProcedure.subscription(() => {
			return observable<NotificationEvent>((emit) => {
				const onComplete = (data: AgentCompleteEvent) => {
					emit.next({ type: "agent-complete", data });
				};

				const onFocusTab = (data: NotificationIds) => {
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
