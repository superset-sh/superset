export interface PullRequestCheck {
	name: string;
	status: "success" | "failure" | "pending" | "skipped" | "cancelled";
	url: string | null;
}

export type PullRequestChecksStatus =
	| "success"
	| "failure"
	| "pending"
	| "none";

export function summarizePullRequestChecks(checks: PullRequestCheck[]) {
	const relevantChecks = checks.filter(
		(check) => check.status !== "skipped" && check.status !== "cancelled",
	);
	const passing = relevantChecks.filter(
		(check) => check.status === "success",
	).length;
	const failing = relevantChecks.filter(
		(check) => check.status === "failure",
	).length;
	const pending = relevantChecks.filter(
		(check) => check.status === "pending",
	).length;
	const status: PullRequestChecksStatus =
		relevantChecks.length === 0
			? "none"
			: failing > 0
				? "failure"
				: pending > 0
					? "pending"
					: "success";
	return { relevantChecks, passing, failing, pending, status };
}
