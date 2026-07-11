export type HostUpdateLifecycleDecision =
	| { kind: "checking" }
	| { kind: "resume"; targetVersion: string }
	| { kind: "verify"; targetVersion: string; resultKey: string }
	| { kind: "settled" };

export interface HostUpdateStatusSnapshot {
	status: "idle" | "updating" | "succeeded" | "failed";
	targetVersion?: string;
	completedAt?: number;
}

interface GetHostUpdateLifecycleDecisionInput {
	status: HostUpdateStatusSnapshot | undefined;
	isFetchedAfterMount: boolean;
	runningVersion: string | null;
	expectedVersion: string;
	now: number;
	recentCompletionWindowMs: number;
}

export function getHostUpdateLifecycleDecision({
	status,
	isFetchedAfterMount,
	runningVersion,
	expectedVersion,
	now,
	recentCompletionWindowMs,
}: GetHostUpdateLifecycleDecisionInput): HostUpdateLifecycleDecision {
	if (!isFetchedAfterMount || !status) return { kind: "checking" };

	if (status.status === "updating" && status.targetVersion) {
		if (runningVersion === status.targetVersion) return { kind: "settled" };
		return { kind: "resume", targetVersion: status.targetVersion };
	}

	if (
		status.status === "succeeded" &&
		status.targetVersion === expectedVersion &&
		runningVersion !== expectedVersion
	) {
		const completionAge =
			typeof status.completedAt === "number"
				? now - status.completedAt
				: Number.POSITIVE_INFINITY;
		if (completionAge >= 0 && completionAge <= recentCompletionWindowMs) {
			return { kind: "resume", targetVersion: status.targetVersion };
		}
		return {
			kind: "verify",
			targetVersion: status.targetVersion,
			resultKey: `${status.targetVersion}:${status.completedAt ?? "unknown"}`,
		};
	}

	return { kind: "settled" };
}

export type TerminalVerificationState =
	| "not-needed"
	| "pending"
	| "complete"
	| "failed";

interface CanOfferHostUpdateInput {
	versionState: "match" | "outdated" | "newer" | "invalid" | null;
	canUpdate: boolean;
	isOnline: boolean;
	supportsRemoteUpdate: boolean;
	isRequestPending: boolean;
	isAwaitingTarget: boolean;
	lifecycle: HostUpdateLifecycleDecision;
	terminalVerification: TerminalVerificationState;
}

export function canOfferHostUpdate({
	versionState,
	canUpdate,
	isOnline,
	supportsRemoteUpdate,
	isRequestPending,
	isAwaitingTarget,
	lifecycle,
	terminalVerification,
}: CanOfferHostUpdateInput): boolean {
	if (
		versionState !== "outdated" ||
		!canUpdate ||
		!isOnline ||
		!supportsRemoteUpdate ||
		isRequestPending ||
		isAwaitingTarget
	) {
		return false;
	}

	if (lifecycle.kind === "checking" || lifecycle.kind === "resume") {
		return false;
	}

	if (lifecycle.kind === "verify") {
		return terminalVerification === "complete";
	}

	return (
		terminalVerification !== "pending" && terminalVerification !== "failed"
	);
}
