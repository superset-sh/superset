import { observable } from "@trpc/server/observable";
import {
	type AgentLifecycleEvent,
	type NotificationIds,
	notificationsEmitter,
} from "main/lib/notifications/server";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { publicProcedure, router } from "..";

type NotificationEvent =
	| {
			type: typeof NOTIFICATION_EVENTS.AGENT_LIFECYCLE;
			data?: AgentLifecycleEvent;
	  }
	| { type: typeof NOTIFICATION_EVENTS.FOCUS_TAB; data?: NotificationIds };

export const createNotificationsRouter = () => {
	return router({
		subscribe: publicProcedure.subscription(() => {
			return observable<NotificationEvent>((emit) => {
				const onLifecycle = (data: AgentLifecycleEvent) => {
					emit.next({ type: NOTIFICATION_EVENTS.AGENT_LIFECYCLE, data });
				};

				const onFocusTab = (data: NotificationIds) => {
					emit.next({ type: NOTIFICATION_EVENTS.FOCUS_TAB, data });
				};

				notificationsEmitter.on(
					NOTIFICATION_EVENTS.AGENT_LIFECYCLE,
					onLifecycle,
				);
				notificationsEmitter.on(NOTIFICATION_EVENTS.FOCUS_TAB, onFocusTab);

				return () => {
					notificationsEmitter.off(
						NOTIFICATION_EVENTS.AGENT_LIFECYCLE,
						onLifecycle,
					);
					notificationsEmitter.off(NOTIFICATION_EVENTS.FOCUS_TAB, onFocusTab);
				};
			});
		}),
	});
};
