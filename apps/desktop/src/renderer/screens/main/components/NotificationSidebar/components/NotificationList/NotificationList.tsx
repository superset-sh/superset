import type { AgentNotification } from "renderer/stores/agent-screens";
import { NotificationCard } from "../NotificationCard";

interface NotificationListProps {
	notifications: AgentNotification[];
}

export function NotificationList({ notifications }: NotificationListProps) {
	// Group notifications by status
	const pendingNotifications = notifications.filter(
		(n) => n.status === "pending",
	);
	const viewedNotifications = notifications.filter(
		(n) => n.status === "viewed",
	);

	return (
		<div className="flex flex-col">
			{/* Pending notifications */}
			{pendingNotifications.length > 0 && (
				<div className="p-2 space-y-2">
					<p className="text-xs font-medium text-muted-foreground px-2">New</p>
					{pendingNotifications.map((notification) => (
						<NotificationCard
							key={notification.id}
							notification={notification}
						/>
					))}
				</div>
			)}

			{/* Viewed notifications */}
			{viewedNotifications.length > 0 && (
				<div className="p-2 space-y-2">
					<p className="text-xs font-medium text-muted-foreground px-2">
						Earlier
					</p>
					{viewedNotifications.map((notification) => (
						<NotificationCard
							key={notification.id}
							notification={notification}
						/>
					))}
				</div>
			)}
		</div>
	);
}
