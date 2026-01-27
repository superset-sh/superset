import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider";
import { agentNotificationOperations } from "renderer/stores/agent-screens";
import { MOCK_ORG_ID } from "shared/constants";
import { AgentScreenView } from "./components/AgentScreenView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/screen/$screenId/",
)({
	component: ScreenPage,
});

function ScreenPage() {
	const { screenId } = Route.useParams();
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();
	const organizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: session?.session?.activeOrganizationId;
	const collections = useCollections();

	// Get screen from collection
	const { data: screens } = useLiveQuery(
		(q) =>
			q
				.from({ screens: collections.agentScreens })
				.where(({ screens }) => eq(screens.id, screenId))
				.select(({ screens }) => ({ ...screens })),
		[collections.agentScreens, screenId],
	);

	const screen = screens?.[0];

	// Get pending notification for this screen
	const { data: pendingNotifications } = useLiveQuery(
		(q) =>
			q
				.from({ notifications: collections.agentNotifications })
				.where(({ notifications }) => eq(notifications.screenId, screenId))
				.where(({ notifications }) => eq(notifications.status, "pending"))
				.select(({ notifications }) => ({ id: notifications.id })),
		[collections.agentNotifications, screenId],
	);

	const pendingNotificationId = pendingNotifications?.[0]?.id;

	// Mark associated notification as viewed when screen is opened
	useEffect(() => {
		if (pendingNotificationId) {
			agentNotificationOperations.markNotificationViewed(
				collections.agentNotifications,
				pendingNotificationId,
			);
		}
	}, [pendingNotificationId, collections.agentNotifications]);

	// Screen not found
	if (!screen) {
		return (
			<div className="flex-1 h-full flex items-center justify-center">
				<div className="text-center">
					<h2 className="text-lg font-medium text-foreground mb-2">
						Screen Not Found
					</h2>
					<p className="text-sm text-muted-foreground mb-4">
						The requested screen does not exist or has been dismissed.
					</p>
					<button
						type="button"
						onClick={() => navigate({ to: "/" })}
						className="text-sm text-primary hover:underline"
					>
						Go back to workspaces
					</button>
				</div>
			</div>
		);
	}

	// Check organization match
	if (screen.organizationId !== organizationId) {
		return (
			<div className="flex-1 h-full flex items-center justify-center">
				<div className="text-center">
					<h2 className="text-lg font-medium text-foreground mb-2">
						Access Denied
					</h2>
					<p className="text-sm text-muted-foreground mb-4">
						This screen belongs to a different organization.
					</p>
					<button
						type="button"
						onClick={() => navigate({ to: "/" })}
						className="text-sm text-primary hover:underline"
					>
						Go back to workspaces
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 h-full flex flex-col overflow-hidden">
			<AgentScreenView screen={screen} />
		</div>
	);
}
