import { useCallback, useState } from "react";
import { env } from "renderer/env.renderer";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { WorkspaceHostTarget } from "../../components/DashboardNewWorkspaceForm/components/DevicePicker";

interface CreateDashboardWorkspaceInput {
	projectId: string;
	name: string;
	branch: string;
	hostTarget: WorkspaceHostTarget;
}

export function useCreateDashboardWorkspace() {
	const [isPending, setIsPending] = useState(false);
	const { activeHostUrl } = useLocalHostService();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();

	const createWorkspace = useCallback(
		async (input: CreateDashboardWorkspaceInput) => {
			setIsPending(true);
			try {
				const hostUrl =
					input.hostTarget.kind === "local"
						? activeHostUrl
						: `${env.RELAY_URL}/hosts/${input.hostTarget.hostId}`;

				if (!hostUrl) {
					throw new Error("Host service not available");
				}

				const client = getHostServiceClientByUrl(hostUrl);
				const workspace = await client.workspace.create.mutate({
					projectId: input.projectId,
					name: input.name,
					branch: input.branch,
				});
				ensureWorkspaceInSidebar(workspace.id, input.projectId);
				return workspace;
			} finally {
				setIsPending(false);
			}
		},
		[ensureWorkspaceInSidebar, activeHostUrl],
	);

	return { createWorkspace, isPending };
}
