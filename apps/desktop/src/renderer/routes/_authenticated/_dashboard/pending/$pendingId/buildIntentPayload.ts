import type { AdoptWorktreeInput } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/hooks/useAdoptWorktree/useAdoptWorktree";
import type { CheckoutWorkspaceInput } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/hooks/useCheckoutDashboardWorkspace/useCheckoutDashboardWorkspace";
import type { CreateWorkspaceInput } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/hooks/useCreateDashboardWorkspace/useCreateDashboardWorkspace";
import type { PendingWorkspaceRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

/**
 * Pure builders that translate a `PendingWorkspaceRow` into the input shape
 * each host-service mutation expects. Kept pure (no React, no IO) so the
 * dispatch logic in the pending page is testable in isolation. See
 * `buildIntentPayload.test.ts` for the contract suite.
 */

type Attachment = { data: string; mediaType: string; filename: string };

export function mapLinkedContextFromPending(
	pending: Pick<PendingWorkspaceRow, "linkedIssues" | "linkedPR">,
): {
	internalIssueIds: string[] | undefined;
	githubIssueUrls: string[] | undefined;
	linkedPrUrl: string | undefined;
} {
	const internalIssueIds = pending.linkedIssues
		.filter((i) => i.source === "internal" && i.taskId)
		.map((i) => i.taskId as string);
	const githubIssueUrls = pending.linkedIssues
		.filter((i) => i.source === "github" && i.url)
		.map((i) => i.url as string);
	return {
		internalIssueIds:
			internalIssueIds.length > 0 ? internalIssueIds : undefined,
		githubIssueUrls: githubIssueUrls.length > 0 ? githubIssueUrls : undefined,
		linkedPrUrl: pending.linkedPR?.url,
	};
}

export function buildForkPayload(
	pendingId: string,
	pending: PendingWorkspaceRow,
	attachments: Attachment[] | undefined,
): CreateWorkspaceInput {
	const linked = mapLinkedContextFromPending(pending);
	return {
		pendingId,
		projectId: pending.projectId,
		hostTarget: pending.hostTarget,
		names: {
			workspaceName: pending.name,
			branchName: pending.branchName,
		},
		composer: {
			prompt: pending.prompt || undefined,
			baseBranch: pending.baseBranch || undefined,
			baseBranchSource: pending.baseBranchSource ?? undefined,
			runSetupScript: pending.runSetupScript,
		},
		linkedContext: {
			internalIssueIds: linked.internalIssueIds,
			githubIssueUrls: linked.githubIssueUrls,
			linkedPrUrl: linked.linkedPrUrl,
			attachments,
		},
	};
}

export function buildCheckoutPayload(
	pendingId: string,
	pending: PendingWorkspaceRow,
): CheckoutWorkspaceInput {
	return {
		pendingId,
		projectId: pending.projectId,
		hostTarget: pending.hostTarget,
		workspaceName: pending.name,
		branch: pending.branchName,
		composer: { runSetupScript: pending.runSetupScript },
	};
}

export function buildAdoptPayload(
	pending: PendingWorkspaceRow,
): AdoptWorktreeInput {
	return {
		projectId: pending.projectId,
		hostTarget: pending.hostTarget,
		workspaceName: pending.name,
		branch: pending.branchName,
	};
}
