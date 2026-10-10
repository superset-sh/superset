import type { DesktopNotification } from "@superset/shared/desktop-notification";
import { Notification } from "electron";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { playNotificationSound } from "../notification-sound";
import { getFocusedOrLastWindow } from "../window-registry/window-registry";
import { notificationsEmitter } from "./server";

/** Shows a notification sent with `superset notifications show`. */
export function showCliNotification(input: DesktopNotification): boolean {
	if (!Notification.isSupported()) return false;
	const notification = new Notification({
		title: input.title,
		body: input.body ?? "",
		silent: true,
	});
	notification.on("click", () => {
		const window = getFocusedOrLastWindow();
		if (window?.isMinimized()) window.restore();
		window?.show();
		window?.focus();
		if (!input.target) return;
		notificationsEmitter.emit(
			NOTIFICATION_EVENTS.FOCUS_V2_NOTIFICATION_SOURCE,
			{
				workspaceId: input.target.workspaceId,
				source: { type: "terminal", id: input.target.terminalId },
			},
		);
	});
	notification.show();
	if (input.sound) playNotificationSound();
	return true;
}
