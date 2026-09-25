import { observable } from "@trpc/server/observable";
import type {
	BrowserWindow,
	Notification as ElectronNotification,
} from "electron";
import { Notification } from "electron";
import { setBadgeCount } from "main/lib/dock-icon";
import { notificationsEmitter } from "main/lib/notifications/server";
import { NOTIFICATION_EVENTS } from "shared/constants";
import type { NotificationSourceFocusTarget } from "shared/notification-types";
import { z } from "zod";
import { publicProcedure, router } from "..";

type NotificationEvent =
	| {
			type: typeof NOTIFICATION_EVENTS.FOCUS_NOTIFICATION_SOURCE;
			data?: NotificationSourceFocusTarget;
	  }
	| {
			type: typeof NOTIFICATION_EVENTS.SETTINGS_EXTERNAL_CHANGE;
			data?: { themeState?: unknown };
	  };

const notificationSourceSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("terminal"), id: z.string().min(1) }),
	z.object({ type: z.literal("chat"), id: z.string().min(1) }),
]);

const showNativeInputSchema = z.object({
	title: z.string().min(1),
	subtitle: z.string().optional(),
	body: z.string(),
	silent: z.boolean().default(true),
	clickTarget: z
		.object({
			workspaceId: z.string().min(1),
			source: notificationSourceSchema,
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
					subtitle: process.platform === "darwin" ? input.subtitle : undefined,
					body:
						process.platform !== "darwin" && input.subtitle
							? `${input.subtitle}\n${input.body}`
							: input.body,
					silent: input.silent,
				});
				const key = getNativeNotificationKey(input);
				trackNativeNotification(key, notification);

				notification.on("click", () => {
					focusWindow(getWindow);
					if (!input.clickTarget) return;
					notificationsEmitter.emit(
						NOTIFICATION_EVENTS.FOCUS_NOTIFICATION_SOURCE,
						input.clickTarget,
					);
				});

				notification.show();
				return { success: true as const };
			}),

		setDockBadge: publicProcedure
			.input(z.object({ count: z.number().int().min(0) }))
			.mutation(({ input }) => {
				setBadgeCount(input.count);
				return { success: true as const };
			}),

		subscribe: publicProcedure.subscription(() => {
			return observable<NotificationEvent>((emit) => {
				const onFocusNotificationSource = (
					data: NotificationSourceFocusTarget,
				) => {
					emit.next({
						type: NOTIFICATION_EVENTS.FOCUS_NOTIFICATION_SOURCE,
						data,
					});
				};

				const onSettingsExternalChange = (data: { themeState?: unknown }) => {
					emit.next({
						type: NOTIFICATION_EVENTS.SETTINGS_EXTERNAL_CHANGE,
						data,
					});
				};

				notificationsEmitter.on(
					NOTIFICATION_EVENTS.FOCUS_NOTIFICATION_SOURCE,
					onFocusNotificationSource,
				);
				notificationsEmitter.on(
					NOTIFICATION_EVENTS.SETTINGS_EXTERNAL_CHANGE,
					onSettingsExternalChange,
				);

				return () => {
					notificationsEmitter.off(
						NOTIFICATION_EVENTS.FOCUS_NOTIFICATION_SOURCE,
						onFocusNotificationSource,
					);
					notificationsEmitter.off(
						NOTIFICATION_EVENTS.SETTINGS_EXTERNAL_CHANGE,
						onSettingsExternalChange,
					);
				};
			});
		}),
	});
};
