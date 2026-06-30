import { env } from "shared/env.shared";

let notificationsPort = env.DESKTOP_NOTIFICATIONS_PORT;

export function getNotificationsPort(): number {
	return notificationsPort;
}

export function setNotificationsPort(port: number): void {
	notificationsPort = port;
}
