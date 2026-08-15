import { FEATURE_FLAGS } from "@superset/shared/constants";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { HiOutlineCloud } from "react-icons/hi2";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/**
 * Cloud workspaces are listed separately rather than folded into the project
 * sections: they have no host, no worktree on this machine, and none of the
 * drag/pin/status affordances those rows carry.
 */
export function DashboardSidebarCloudSection({
	isCollapsed,
}: {
	isCollapsed?: boolean;
}) {
	const navigate = useNavigate();
	const enabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	const { data: workspaces = [] } = cloudTrpc.cloudWorkspace.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: Boolean(enabled && organizationId), refetchInterval: 30_000 },
	);

	if (!enabled || workspaces.length === 0) return null;

	return (
		<div className="mb-1">
			{!isCollapsed && (
				<div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
					Cloud
				</div>
			)}
			{workspaces.map((workspace) => (
				<button
					type="button"
					key={workspace.id}
					onClick={() =>
						navigate({
							to: "/v2-workspace/$workspaceId",
							params: { workspaceId: workspace.id },
						})
					}
					title={workspace.name}
					className={cn(
						"flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm",
						"hover:bg-accent/60",
						isCollapsed && "justify-center px-0",
					)}
				>
					<HiOutlineCloud className="size-4 shrink-0 text-muted-foreground" />
					{!isCollapsed && (
						<span className="min-w-0 truncate">{workspace.name}</span>
					)}
				</button>
			))}
		</div>
	);
}
