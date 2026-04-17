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
		composer: {
			baseBranch: pending.baseBranch || undefined,
			runSetupScript: pending.runSetupScript,
		},
	};
}

/**
 * Builds the `workspaceCreation.checkout` payload for PR mode. Requires the
 * resolved PR content fetched at pending-page time (not persisted in the
 * pending row itself — kept narrow on purpose).
 *
 * The server derives the real local branch name from `pr.headRefName` +
 * `pr.isCrossRepository`; the pending row's `branchName` is only a display
 * placeholder in PR mode.
 */
export function buildPrCheckoutPayload(
	pendingId: string,
	pending: PendingWorkspaceRow,
	prContent: {
		number: number;
		url: string;
		title: string;
		branch: string; // headRefName
		baseBranch: string; // baseRefName
		headRepositoryOwner: string | null;
		isCrossRepository: boolean;
		state: string;
	},
): CheckoutWorkspaceInput {
	// Null owner on a cross-repo PR means the head fork repo has been
	// deleted. We can't derive `<owner>/<headRefName>` without it, and
	// `gh pr checkout` wouldn't have a fork to configure push against.
	// Fail early with a clear error rather than a cryptic server-side
	// "headRepositoryOwner is required".
	if (prContent.isCrossRepository && !prContent.headRepositoryOwner) {
		throw new Error(
			`Cannot check out PR #${prContent.number}: the head fork repository has been deleted.`,
		);
	}
	const linked = mapLinkedContextFromPending(pending);
	const normalizedState: "open" | "closed" | "merged" =
		prContent.state === "closed"
			? "closed"
			: prContent.state === "merged"
				? "merged"
				: "open";
	return {
		pendingId,
		projectId: pending.projectId,
		hostTarget: pending.hostTarget,
		workspaceName: pending.name,
		pr: {
			number: prContent.number,
			url: prContent.url,
			title: prContent.title,
			headRefName: prContent.branch,
			baseRefName: prContent.baseBranch,
			// Same-repo PRs don't need an owner for branch derivation; pass an
			// empty string rather than leaking null into the server input.
			headRepositoryOwner: prContent.headRepositoryOwner ?? "",
			isCrossRepository: prContent.isCrossRepository,
			state: normalizedState,
		},
		composer: {
			prompt: pending.prompt || undefined,
			// PR's base is authoritative for the Changes tab — see plan §3.
			baseBranch: prContent.baseBranch,
			runSetupScript: pending.runSetupScript,
		},
		linkedContext: {
			internalIssueIds: linked.internalIssueIds,
			githubIssueUrls: linked.githubIssueUrls,
			linkedPrUrl: linked.linkedPrUrl ?? prContent.url,
		},
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
