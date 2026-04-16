import { useCallback } from "react";
import { env } from "renderer/env.renderer";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { WorkspaceHostTarget } from "../../components/DashboardNewWorkspaceForm/components/DevicePicker";

export interface CheckoutWorkspaceInput {
	pendingId: string;
	projectId: string;
	hostTarget: WorkspaceHostTarget;
	workspaceName: string;
	branch: string;
	composer: {
		prompt?: string;
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
 * Thin wrapper around the host-service `workspaceCreation.checkout` mutation.
 * Creates a new workspace that reuses an existing branch (no new branch).
 */
export function useCheckoutDashboardWorkspace() {
	const { activeHostUrl } = useLocalHostService();

	return useCallback(
		async (input: CheckoutWorkspaceInput) => {
			const hostUrl =
				input.hostTarget.kind === "local"
					? activeHostUrl
					: `${env.RELAY_URL}/hosts/${input.hostTarget.hostId}`;

			if (!hostUrl) {
				throw new Error("Host service not available");
			}

			const client = getHostServiceClientByUrl(hostUrl);

			return client.workspaceCreation.checkout.mutate({
				pendingId: input.pendingId,
				projectId: input.projectId,
				workspaceName: input.workspaceName,
				branch: input.branch,
				composer: input.composer,
				linkedContext: input.linkedContext,
			});
		},
		[activeHostUrl],
	);
}
