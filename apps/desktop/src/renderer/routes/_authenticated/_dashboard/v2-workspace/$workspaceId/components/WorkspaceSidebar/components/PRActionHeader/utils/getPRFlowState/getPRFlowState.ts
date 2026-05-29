import type { AppRouter } from "@superset/host-service";
import type { inferRouterOutputs } from "@trpc/server";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type BranchSyncStatus = RouterOutputs["git"]["getBranchSyncStatus"];
export type PullRequest = NonNullable<RouterOutputs["git"]["getPullRequest"]>;

export type UnavailableReason = "no-repo" | "default-branch" | "detached-head";

export type PRFlowState =
	| { kind: "loading" }
	| { kind: "unavailable"; reason: UnavailableReason }
	| { kind: "no-pr"; sync: BranchSyncStatus }
	| { kind: "pr-exists"; pr: PullRequest; sync: BranchSyncStatus | null }
	| { kind: "busy"; pr: PullRequest | null }
	| { kind: "error"; pr: PullRequest | null; message: string };

export interface GetPRFlowStateInput {
	pr: PullRequest | null;
	sync: BranchSyncStatus | null;
	isLoading: boolean;
	isAgentRunning: boolean;
	loadError: Error | null;
}

export function getPRFlowState(input: GetPRFlowStateInput): PRFlowState {
	const { pr, sync, isLoading, isAgentRunning, loadError } = input;

	if (loadError && !sync && !pr) {
		return { kind: "error", pr: null, message: loadError.message };
	}

	if (isLoading && !sync) {
		return { kind: "loading" };
	}

	if (isAgentRunning) {
		return { kind: "busy", pr };
	}

	if (!sync || !sync.hasRepo) {
		return { kind: "unavailable", reason: "no-repo" };
	}
	if (sync.isDetached) {
		return { kind: "unavailable", reason: "detached-head" };
	}
	if (sync.isDefaultBranch) {
		return { kind: "unavailable", reason: "default-branch" };
	}

	if (pr) {
		return { kind: "pr-exists", pr, sync };
	}

	return { kind: "no-pr", sync };
}

// ---------------------------------------------------------------------------
// Selectors: derive header UI pieces from the flow state.
// Kept in this file because all three fork on the same `kind` discriminant.
// ---------------------------------------------------------------------------

export type ActionButtonVariant =
	| { kind: "hidden" }
	| { kind: "disabled-tooltip"; reasonKind: UnavailableReason }
	| { kind: "create-pr-dropdown" }
	| { kind: "update-pr-dropdown"; blockedReason?: string }
	| { kind: "view-pr"; url: string }
	| { kind: "cancel-busy" }
	| { kind: "retry" };

export function selectActionButton(state: PRFlowState): ActionButtonVariant {
	switch (state.kind) {
		case "loading":
			return { kind: "hidden" };
		case "unavailable":
			return { kind: "disabled-tooltip", reasonKind: state.reason };
		case "no-pr":
			return { kind: "create-pr-dropdown" };
		case "pr-exists":
			return selectPRExistsAction(state.pr, state.sync);
		case "busy":
			return { kind: "cancel-busy" };
		case "error":
			return { kind: "retry" };
	}
}

/**
 * Per-state primary action when a PR already exists. Mirrors t3code's
 * `resolveQuickAction` pattern: merged/closed PRs surface no action,
 * fully-synced open PRs swap to "View PR" (no agent invocation), branches
 * behind upstream block the update with a tooltip reason.
 */
function selectPRExistsAction(
	pr: PullRequest,
	sync: BranchSyncStatus | null,
): ActionButtonVariant {
	if (pr.state === "merged" || pr.state === "closed") {
		return { kind: "hidden" };
	}
	if (pr.state === "open" && !pr.isDraft && isInSync(sync)) {
		return { kind: "view-pr", url: pr.url };
	}
	if (sync?.hasUpstream && sync.pullCount > 0) {
		const noun =
			sync.pullCount === 1
				? "1 commit behind"
				: `${sync.pullCount} commits behind`;
		return {
			kind: "update-pr-dropdown",
			blockedReason: `Sync your branch first — ${noun} upstream`,
		};
	}
	return { kind: "update-pr-dropdown" };
}

function isInSync(sync: BranchSyncStatus | null): boolean {
	if (!sync) return false;
	return (
		sync.hasUpstream &&
		!sync.hasUncommitted &&
		sync.pushCount === 0 &&
		sync.pullCount === 0
	);
}

export type PRLinkVariant =
	| { kind: "none" }
	| {
			kind: "pr-link";
			state: "open" | "draft" | "merged" | "closed";
			number: number;
			url: string;
	  };

export function selectPRLink(state: PRFlowState): PRLinkVariant {
	const pr = getPRFromState(state);
	if (!pr) return { kind: "none" };
	const linkState = pr.isDraft
		? "draft"
		: pr.state === "merged"
			? "merged"
			: pr.state === "closed"
				? "closed"
				: "open";
	return {
		kind: "pr-link",
		state: linkState,
		number: pr.number,
		url: pr.url,
	};
}

export function selectStatusBadge(state: PRFlowState): string | null {
	switch (state.kind) {
		case "loading":
			return null;
		case "unavailable":
			return unavailableBadge(state.reason);
		case "no-pr":
			return syncBadgeText(state.sync);
		case "pr-exists":
			if (state.pr.isDraft) return "Draft";
			if (state.pr.state === "merged") return "Merged";
			if (state.pr.state === "closed") return "Closed";
			return "Open";
		case "busy":
			return "Agent working…";
		case "error":
			return "Failed to refresh — retry";
	}
}

function getPRFromState(state: PRFlowState): PullRequest | null {
	switch (state.kind) {
		case "pr-exists":
			return state.pr;
		case "busy":
		case "error":
			return state.pr;
		default:
			return null;
	}
}

function unavailableBadge(reason: UnavailableReason): string {
	switch (reason) {
		case "no-repo":
			return "No GitHub repo";
		case "default-branch":
			return "On default branch";
		case "detached-head":
			return "Detached HEAD";
	}
}

function syncBadgeText(sync: BranchSyncStatus): string {
	if (!sync.hasUpstream) return "Not published";
	if (sync.pushCount > 0 && sync.pullCount > 0) return "Diverged";
	if (sync.pushCount > 0)
		return `${sync.pushCount} commit${sync.pushCount === 1 ? "" : "s"} to push`;
	if (sync.pullCount > 0)
		return `${sync.pullCount} commit${sync.pullCount === 1 ? "" : "s"} to pull`;
	if (sync.hasUncommitted) return "Uncommitted changes";
	return "Ready";
}
