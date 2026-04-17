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
	// Exactly one of `branch` or `pr` must be set — enforced server-side
	// via zod refine. Branch mode: materialize an existing local/remote
	// branch. PR mode: materialize a PR's branch via `gh pr checkout`.
	branch?: string;
	pr?: {
		number: number;
		url: string;
		title: string;
		headRefName: string;
		baseRefName: string;
		headRepositoryOwner: string;
		isCrossRepository: boolean;
		state: "open" | "closed" | "merged";
	};
	composer: {
		prompt?: string;
		// Written to `branch.<name>.base` for the Changes tab. Filled from
		// picker selection in branch mode, `pr.baseRefName` in PR mode.
		baseBranch?: string;
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
 * Two modes:
 * - Branch mode (`branch` set): reuse an existing local/remote branch.
 * - PR mode (`pr` set): materialize a PR's branch via `gh pr checkout`;
 *   idempotent (returns `alreadyExists: true` if a workspace already exists
 *   for the derived branch).
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
				pr: input.pr,
				composer: input.composer,
				linkedContext: input.linkedContext,
			});
		},
		[activeHostUrl],
	);
}
