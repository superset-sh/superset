import { useNavigate } from "@tanstack/react-router";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useNow } from "renderer/hooks/useNow";
import { authClient } from "renderer/lib/auth-client";
import {
	ACTIVE_WITHIN_MS,
	CloudWorkspacePresenceStack,
} from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacePresenceStack";
import { CloudWorkspaceShareButton } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspaceShareButton";
import { useSetCloudWorkspaceVisibility } from "renderer/routes/_authenticated/_dashboard/hooks/useSetCloudWorkspaceVisibility";

const NOW_TICK_MS = 30_000;

export function CloudWorkspaceTabBarControls({
	workspaceId,
}: {
	workspaceId: string;
}) {
	const navigate = useNavigate();
	const now = useNow(NOW_TICK_MS);
	const { data: session } = authClient.useSession();
	const { workspaces } = useCloudWorkspaces();
	const setVisibility = useSetCloudWorkspaceVisibility();

	const workspace = workspaces?.find((row) => row.id === workspaceId);
	if (!workspace) return null;
	return (
		<div className="flex items-center gap-1">
			<CloudWorkspaceShareButton
				workspaceId={workspace.id}
				owner={workspace.createdBy}
				visibility={workspace.visibility}
				canEdit={
					session?.user?.id !== undefined &&
					workspace.createdBy?.userId === session.user.id
				}
				onSetVisibility={(visibility) =>
					setVisibility.mutateAsync({ id: workspace.id, visibility })
				}
			/>
			<CloudWorkspacePresenceStack
				people={workspace.presence}
				viewerId={session?.user?.id}
				now={now}
				activeWithinMs={ACTIVE_WITHIN_MS}
				onOpenPerson={(userId) =>
					navigate({ to: "/cloud-workspaces", search: { people: [userId] } })
				}
			/>
		</div>
	);
}
