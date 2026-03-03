import { observable } from "@trpc/server/observable";
import {
	type AgentLifecycleEvent,
	consumePendingMainProcessErrors,
	type MainProcessErrorEvent,
	type NotificationIds,
	notificationsEmitter,
} from "main/lib/notifications/server";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { publicProcedure, router } from "..";

type TerminalExitNotification = NotificationIds & {
	exitCode: number;
	signal?: number;
	reason?: "killed" | "exited" | "error";
};

type NotificationEvent =
	| {
			type: typeof NOTIFICATION_EVENTS.AGENT_LIFECYCLE;
			data?: AgentLifecycleEvent;
	  }
	| { type: typeof NOTIFICATION_EVENTS.FOCUS_TAB; data?: NotificationIds }
	| {
			type: typeof NOTIFICATION_EVENTS.TERMINAL_EXIT;
			data?: TerminalExitNotification;
	  }
	| {
			type: typeof NOTIFICATION_EVENTS.MAIN_PROCESS_ERROR;
			data?: MainProcessErrorEvent;
	  };

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

				const onTerminalExit = (data: TerminalExitNotification) => {
					emit.next({ type: NOTIFICATION_EVENTS.TERMINAL_EXIT, data });
				};

				const onMainProcessError = (data: MainProcessErrorEvent) => {
					emit.next({ type: NOTIFICATION_EVENTS.MAIN_PROCESS_ERROR, data });
				};

				notificationsEmitter.on(
					NOTIFICATION_EVENTS.AGENT_LIFECYCLE,
					onLifecycle,
				);
				notificationsEmitter.on(NOTIFICATION_EVENTS.FOCUS_TAB, onFocusTab);
				notificationsEmitter.on(
					NOTIFICATION_EVENTS.TERMINAL_EXIT,
					onTerminalExit,
				);
				notificationsEmitter.on(
					NOTIFICATION_EVENTS.MAIN_PROCESS_ERROR,
					onMainProcessError,
				);

				for (const event of consumePendingMainProcessErrors()) {
					emit.next({
						type: NOTIFICATION_EVENTS.MAIN_PROCESS_ERROR,
						data: event,
					});
				}

				return () => {
					notificationsEmitter.off(
						NOTIFICATION_EVENTS.AGENT_LIFECYCLE,
						onLifecycle,
					);
					notificationsEmitter.off(NOTIFICATION_EVENTS.FOCUS_TAB, onFocusTab);
					notificationsEmitter.off(
						NOTIFICATION_EVENTS.TERMINAL_EXIT,
						onTerminalExit,
					);
					notificationsEmitter.off(
						NOTIFICATION_EVENTS.MAIN_PROCESS_ERROR,
						onMainProcessError,
					);
				};
			});
		}),
	});
};
