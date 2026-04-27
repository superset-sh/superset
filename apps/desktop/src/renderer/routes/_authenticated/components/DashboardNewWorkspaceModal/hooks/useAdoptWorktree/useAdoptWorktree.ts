import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useCallback } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { WorkspaceHostTarget } from "../../components/DashboardNewWorkspaceForm/components/DevicePicker";

export interface AdoptWorktreeInput {
	projectId: string;
	hostTarget: WorkspaceHostTarget;
	workspaceName: string;
	branch: string;
}

/**
 * Registers a workspace row for an existing `.worktrees/<branch>` directory
 * that has no matching workspaces row. No git ops — just cloud + local DB.
 */
export function useAdoptWorktree() {
	const { activeHostUrl } = useLocalHostService();
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId ?? null;

	return useCallback(
		async (input: AdoptWorktreeInput) => {
			const hostUrl =
				input.hostTarget.kind === "local"
					? activeHostUrl
					: activeOrganizationId
						? `${env.RELAY_URL}/hosts/${buildHostRoutingKey(activeOrganizationId, input.hostTarget.hostId)}`
						: null;
			if (!hostUrl) throw new Error("Host service not available");
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaceCreation.adopt.mutate({
				projectId: input.projectId,
				workspaceName: input.workspaceName,
				branch: input.branch,
			});
		},
		[activeHostUrl, activeOrganizationId],
	);
}
