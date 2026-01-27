import { Button } from "@superset/ui/button";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { HiOutlineBell } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider";
import { useNotificationSidebarStore } from "renderer/stores/notification-sidebar-state";
import { MOCK_ORG_ID } from "shared/constants";

export function NotificationBadge() {
	const { data: session } = authClient.useSession();
	const organizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;

	const toggleOpen = useNotificationSidebarStore((s) => s.toggleOpen);
	const isOpen = useNotificationSidebarStore((s) => s.isOpen);
	const collections = useCollections();

	const { data: pendingNotifications } = useLiveQuery(
		(q) =>
			q
				.from({ notifications: collections.agentNotifications })
				.where(({ notifications }) => eq(notifications.status, "pending"))
				.select(({ notifications }) => ({ id: notifications.id })),
		[collections.agentNotifications],
	);

	const pendingCount = pendingNotifications?.length ?? 0;

	if (!organizationId) {
		return null;
	}

	return (
		<Button
			variant="ghost"
			size="icon"
			className="relative h-8 w-8 no-drag"
			onClick={toggleOpen}
			title={isOpen ? "Hide notifications" : "Show notifications"}
		>
			<HiOutlineBell className="w-4 h-4" />
			{pendingCount > 0 && (
				<span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
					{pendingCount > 99 ? "99+" : pendingCount}
				</span>
			)}
		</Button>
	);
}
