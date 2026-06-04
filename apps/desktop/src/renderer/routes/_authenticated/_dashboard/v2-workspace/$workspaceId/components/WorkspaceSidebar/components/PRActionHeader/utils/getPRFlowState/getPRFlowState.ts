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
			// Post-PR actions land in a later phase; for now the button hides
			// once a PR exists. The PR link button remains visible on the left.
			return { kind: "hidden" };
		case "busy":
			return { kind: "cancel-busy" };
		case "error":
			return { kind: "retry" };
	}
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
