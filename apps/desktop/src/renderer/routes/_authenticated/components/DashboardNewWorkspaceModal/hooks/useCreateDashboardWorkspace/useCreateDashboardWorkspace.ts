import { useCallback } from "react";
import { env } from "renderer/env.renderer";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { WorkspaceHostTarget } from "../../components/DashboardNewWorkspaceForm/components/DevicePicker";

export interface CreateWorkspaceInput {
	pendingId: string;
	projectId: string;
	hostTarget: WorkspaceHostTarget;
	names: {
		workspaceName: string;
		branchName: string;
	};
	composer: {
		prompt?: string;
		baseBranch?: string;
		baseBranchSource?: "local" | "remote-tracking";
		runSetupScript?: boolean;
	};
	linkedContext?: {
		internalIssueIds?: string[];
		githubIssueUrls?: string[];
		linkedPrUrl?: string;
		attachments?: Array<{
			data: string;
			mediaType: string;
			filename?: string;
		}>;
	};
}

/**
 * Thin wrapper around the host-service `workspaceCreation.create` mutation.
 * The caller is responsible for pending state, toasts, and draft management.
 */
export function useCreateDashboardWorkspace() {
	const { activeHostUrl } = useLocalHostService();

	return useCallback(
		async (input: CreateWorkspaceInput) => {
			const hostUrl =
				input.hostTarget.kind === "local"
					? activeHostUrl
					: `${env.RELAY_URL}/hosts/${input.hostTarget.hostId}`;

			if (!hostUrl) {
				throw new Error("Host service not available");
			}

			const client = getHostServiceClientByUrl(hostUrl);

			return client.workspaceCreation.create.mutate({
				pendingId: input.pendingId,
				projectId: input.projectId,
				names: input.names,
				composer: input.composer,
				linkedContext: input.linkedContext,
			});
		},
		[activeHostUrl],
	);
}
