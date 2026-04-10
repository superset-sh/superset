import { useCallback } from "react";
import { env } from "renderer/env.renderer";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { WorkspaceHostTarget } from "../../components/DashboardNewWorkspaceForm/components/DevicePicker";

type AttachmentInput = {
	data: string;
	mediaType: string;
	filename?: string;
};

export interface CreateWorkspaceInput {
	projectId: string;
	hostTarget: WorkspaceHostTarget;
	source: "prompt" | "pull-request" | "branch" | "issue";
	names: {
		workspaceName?: string;
		branchName?: string;
	};
	composer: {
		prompt?: string;
		compareBaseBranch?: string;
		runSetupScript?: boolean;
	};
	linkedContext?: {
		internalIssueIds?: string[];
		githubIssueUrls?: string[];
		linkedPrUrl?: string;
		attachments?: AttachmentInput[];
	};
	behavior?: {
		onExistingWorkspace?: "open" | "error";
		onExistingWorktree?: "adopt" | "error";
	};
}

/**
 * Thin wrapper around the host-service `workspaceCreation.create` mutation.
 * Returns a single async function; the caller is responsible for pending
 * state, toasts, and draft reset (so draft state is preserved on failure).
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

			console.log(
				"[useCreateDashboardWorkspace] calling workspaceCreation.create",
				{
					hostUrl,
					projectId: input.projectId,
					source: input.source,
					names: input.names,
				},
			);

			const result = await client.workspaceCreation.create.mutate({
				projectId: input.projectId,
				source: input.source,
				names: input.names,
				composer: input.composer,
				linkedContext: input.linkedContext,
				behavior: input.behavior,
			});

			console.log("[useCreateDashboardWorkspace] result", {
				outcome: result.outcome,
				workspace: result.workspace,
				warnings: result.warnings,
			});

			return result;
		},
		[activeHostUrl],
	);
}
