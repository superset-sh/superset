import { observable } from "@trpc/server/observable";
import type {
	BrowserWindow,
	Notification as ElectronNotification,
} from "electron";
import { Notification } from "electron";
import {
	type AgentLifecycleEvent,
	type NotificationIds,
	notificationsEmitter,
} from "main/lib/notifications/server";
import { NOTIFICATION_EVENTS } from "shared/constants";
import type { V2NotificationSourceFocusTarget } from "shared/notification-types";
import { z } from "zod";
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
			type: typeof NOTIFICATION_EVENTS.FOCUS_V2_NOTIFICATION_SOURCE;
			data?: V2NotificationSourceFocusTarget;
	  }
	| {
			type: typeof NOTIFICATION_EVENTS.TERMINAL_EXIT;
			data?: TerminalExitNotification;
	  };

const v2NotificationSourceSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("terminal"), id: z.string().min(1) }),
	z.object({ type: z.literal("chat"), id: z.string().min(1) }),
]);

const showNativeInputSchema = z.object({
	title: z.string().min(1),
	body: z.string(),
	silent: z.boolean().default(true),
	clickTarget: z
		.object({
			workspaceId: z.string().min(1),
			source: v2NotificationSourceSchema,
		})
		.optional(),
});
type ShowNativeInput = z.infer<typeof showNativeInputSchema>;

const activeNativeNotifications = new Map<string, ElectronNotification>();
let nativeNotificationCounter = 0;

function focusWindow(getWindow: () => BrowserWindow | null): void {
	const window = getWindow();
	if (!window) return;
	if (window.isMinimized()) {
		window.restore();
	}
	window.show();
	window.focus();
}

function getNativeNotificationKey(input: ShowNativeInput): string {
	const target = input.clickTarget;
	if (!target) return `_native_${nativeNotificationCounter++}`;
	return `${target.workspaceId}:${target.source.type}:${target.source.id}`;
}

function trackNativeNotification(
	key: string,
	notification: ElectronNotification,
): void {
	const previous = activeNativeNotifications.get(key);
	previous?.close();
	activeNativeNotifications.set(key, notification);

	const untrack = () => {
		if (activeNativeNotifications.get(key) === notification) {
			activeNativeNotifications.delete(key);
		}
	};
	notification.on("click", untrack);
	notification.on("close", untrack);
}

export const createNotificationsRouter = (
	getWindow: () => BrowserWindow | null,
) => {
	return router({
		showNative: publicProcedure
			.input(showNativeInputSchema)
			.mutation(({ input }) => {
				if (!Notification.isSupported()) {
					return { success: false as const, reason: "unsupported" as const };
				}

				const notification = new Notification({
					title: input.title,
					body: input.body,
					silent: input.silent,
				});
				const key = getNativeNotificationKey(input);
				trackNativeNotification(key, notification);

				notification.on("click", () => {
					focusWindow(getWindow);
					if (!input.clickTarget) return;
					notificationsEmitter.emit(
						NOTIFICATION_EVENTS.FOCUS_V2_NOTIFICATION_SOURCE,
						input.clickTarget,
					);
				});

				notification.show();
				return { success: true as const };
			}),

		subscribe: publicProcedure.subscription(() => {
			return observable<NotificationEvent>((emit) => {
				const onLifecycle = (data: AgentLifecycleEvent) => {
					emit.next({ type: NOTIFICATION_EVENTS.AGENT_LIFECYCLE, data });
				};

				const onFocusTab = (data: NotificationIds) => {
					emit.next({ type: NOTIFICATION_EVENTS.FOCUS_TAB, data });
				};

				const onFocusV2NotificationSource = (
					data: V2NotificationSourceFocusTarget,
				) => {
					emit.next({
						type: NOTIFICATION_EVENTS.FOCUS_V2_NOTIFICATION_SOURCE,
						data,
					});
				};

				const onTerminalExit = (data: TerminalExitNotification) => {
					emit.next({ type: NOTIFICATION_EVENTS.TERMINAL_EXIT, data });
				};

				notificationsEmitter.on(
					NOTIFICATION_EVENTS.AGENT_LIFECYCLE,
					onLifecycle,
				);
				notificationsEmitter.on(NOTIFICATION_EVENTS.FOCUS_TAB, onFocusTab);
				notificationsEmitter.on(
					NOTIFICATION_EVENTS.FOCUS_V2_NOTIFICATION_SOURCE,
					onFocusV2NotificationSource,
				);
				notificationsEmitter.on(
					NOTIFICATION_EVENTS.TERMINAL_EXIT,
					onTerminalExit,
				);

				return () => {
					notificationsEmitter.off(
						NOTIFICATION_EVENTS.AGENT_LIFECYCLE,
						onLifecycle,
					);
					notificationsEmitter.off(NOTIFICATION_EVENTS.FOCUS_TAB, onFocusTab);
					notificationsEmitter.off(
						NOTIFICATION_EVENTS.FOCUS_V2_NOTIFICATION_SOURCE,
						onFocusV2NotificationSource,
					);
					notificationsEmitter.off(
						NOTIFICATION_EVENTS.TERMINAL_EXIT,
						onTerminalExit,
					);
				};
			});
		}),
	});
};
