import { useCallback, useState } from "react";
import {
	getHostServiceClientByUrl,
	type HostServiceClient,
} from "renderer/lib/host-service-client";
import {
	resolveCreateWorkspaceHostUrl,
	type WorkspaceHostTarget,
} from "renderer/lib/v2-workspace-host";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useWorkspaceHostOptions } from "../../components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions";

interface CreateDashboardWorkspaceInput {
	projectId: string;
	name: string;
	branch: string;
	hostTarget: WorkspaceHostTarget;
}

export function useCreateDashboardWorkspace() {
	const [isPending, setIsPending] = useState(false);
	const { localHostService } = useWorkspaceHostOptions();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();

	const createWorkspace = useCallback(
		async (input: CreateDashboardWorkspaceInput) => {
			setIsPending(true);
			try {
				const hostUrl = resolveCreateWorkspaceHostUrl(
					input.hostTarget,
					localHostService?.url ?? null,
				);
				if (!hostUrl) {
					throw new Error("Host service not available");
				}

				const client: HostServiceClient =
					input.hostTarget.kind === "local" && localHostService
						? localHostService.client
						: getHostServiceClientByUrl(hostUrl);

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
		[ensureWorkspaceInSidebar, localHostService],
	);

	return { createWorkspace, isPending };
}
