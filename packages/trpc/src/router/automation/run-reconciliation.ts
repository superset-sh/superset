import type { SelectAutomationRun } from "@superset/db/schema";
import {
	isActiveAutomationRunStatus,
	isTerminalAutomationRunStatus,
} from "./run-status";

export const AUTOMATION_RUN_STALE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

type ReconciliationRun = Pick<
	SelectAutomationRun,
	| "status"
	| "createdAt"
	| "updatedAt"
	| "startedAt"
	| "dispatchedAt"
	| "completedAt"
>;

export interface AutomationRunReconciliationDecision {
	shouldFail: boolean;
	failureReason?: string;
	lastActivityAt?: Date;
}

function toTime(value: Date | string | null | undefined): number {
	if (!value) return 0;
	const time = new Date(value).getTime();
	return Number.isFinite(time) ? time : 0;
}

function lastActivityTime(run: ReconciliationRun): number {
	return Math.max(
		toTime(run.updatedAt),
		toTime(run.startedAt),
		toTime(run.dispatchedAt),
		toTime(run.createdAt),
	);
}

export function decideAutomationRunReconciliation(
	run: ReconciliationRun,
	options: {
		now?: Date;
		staleTimeoutMs?: number;
	} = {},
): AutomationRunReconciliationDecision {
	if (isTerminalAutomationRunStatus(run.status)) return { shouldFail: false };
	if (!isActiveAutomationRunStatus(run.status)) return { shouldFail: false };
	if (run.completedAt) return { shouldFail: false };

	const now = options.now ?? new Date();
	const staleTimeoutMs =
		options.staleTimeoutMs ?? AUTOMATION_RUN_STALE_TIMEOUT_MS;
	const lastTime = lastActivityTime(run);
	if (lastTime <= 0) return { shouldFail: false };
	if (now.getTime() - lastTime < staleTimeoutMs) {
		return { shouldFail: false, lastActivityAt: new Date(lastTime) };
	}

	return {
		shouldFail: true,
		lastActivityAt: new Date(lastTime),
		failureReason:
			"Automation run no longer appears active and did not write back a result. Superset marked it failed so it does not remain running forever.",
	};
}
