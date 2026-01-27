import { Button } from "@superset/ui/button";
import { eq, not } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { HiXMark } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider";
import { useNotificationSidebarStore } from "renderer/stores/notification-sidebar-state";
import { MOCK_ORG_ID } from "shared/constants";
import { NotificationList } from "./components/NotificationList";

export function NotificationSidebar() {
	const { data: session } = authClient.useSession();
	const organizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;

	const { isOpen, width, setOpen } = useNotificationSidebarStore();
	const collections = useCollections();

	const { data: notifications } = useLiveQuery(
		(q) =>
			q
				.from({ notifications: collections.agentNotifications })
				.where(({ notifications }) =>
					not(eq(notifications.status, "dismissed")),
				)
				.select(({ notifications }) => ({ ...notifications })),
		[collections.agentNotifications],
	);

	// Sort by createdAt descending
	const sortedNotifications = [...(notifications ?? [])].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	if (!isOpen || !organizationId) {
		return null;
	}

	return (
		<div
			className="h-full border-l border-border bg-background flex flex-col shrink-0"
			style={{ width }}
		>
			{/* Header */}
			<div className="h-12 px-4 flex items-center justify-between border-b border-border shrink-0">
				<h2 className="text-sm font-medium text-foreground">Notifications</h2>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7"
					onClick={() => setOpen(false)}
					title="Close notifications"
				>
					<HiXMark className="w-4 h-4" />
				</Button>
			</div>

			{/* Notification list */}
			<div className="flex-1 overflow-auto">
				{sortedNotifications.length === 0 ? (
					<div className="p-4 text-center">
						<p className="text-sm text-muted-foreground">
							No notifications yet
						</p>
						<p className="text-xs text-muted-foreground/70 mt-1">
							Agent screens will appear here
						</p>
					</div>
				) : (
					<NotificationList notifications={sortedNotifications} />
				)}
			</div>
		</div>
	);
}
