import {
	type AgentCompleteEvent,
	type NotificationIds,
	notificationsEmitter,
} from "main/lib/notifications/server";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { publicProcedure, router } from "..";

type NotificationEvent =
	| {
			type: typeof NOTIFICATION_EVENTS.AGENT_COMPLETE;
			data?: AgentCompleteEvent;
	  }
	| { type: typeof NOTIFICATION_EVENTS.FOCUS_TAB; data?: NotificationIds };

export const createNotificationsRouter = () => {
	return router({
		subscribe: publicProcedure.subscription(async function* () {
			const queue: NotificationEvent[] = [];

			const onComplete = (data: AgentCompleteEvent) => {
				queue.push({ type: NOTIFICATION_EVENTS.AGENT_COMPLETE, data });
			};

			const onFocusTab = (data: NotificationIds) => {
				queue.push({ type: NOTIFICATION_EVENTS.FOCUS_TAB, data });
			};

			notificationsEmitter.on(NOTIFICATION_EVENTS.AGENT_COMPLETE, onComplete);
			notificationsEmitter.on(NOTIFICATION_EVENTS.FOCUS_TAB, onFocusTab);

			try {
				while (true) {
					const event = queue.shift();
					if (event) {
						yield event;
					} else {
						await new Promise((resolve) => setTimeout(resolve, 100));
					}
				}
			} finally {
				notificationsEmitter.off(
					NOTIFICATION_EVENTS.AGENT_COMPLETE,
					onComplete,
				);
				notificationsEmitter.off(NOTIFICATION_EVENTS.FOCUS_TAB, onFocusTab);
			}
		}),
	});
};
