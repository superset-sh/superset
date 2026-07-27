export interface SyncedCheck {
	name: string;
	status: string;
	conclusion: string | null;
	detailsUrl?: string;
}

export type ChecksStatus = "none" | "pending" | "success" | "failure";

const FAILING_CONCLUSIONS = new Set([
	"failure",
	"timed_out",
	"cancelled",
	"action_required",
	"startup_failure",
]);

export function computeChecksStatus(checks: SyncedCheck[]): ChecksStatus {
	if (checks.length === 0) return "none";
	if (
		checks.some(
			(check) =>
				check.conclusion !== null && FAILING_CONCLUSIONS.has(check.conclusion),
		)
	) {
		return "failure";
	}
	if (checks.some((check) => check.status !== "completed")) return "pending";
	return "success";
}
