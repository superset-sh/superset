import type {
	GraphQLCheckContextNode,
	GraphQLPullRequestNode,
} from "../github-query";

export type PullRequestState = "open" | "draft" | "merged" | "closed";
export type ReviewDecision =
	| "approved"
	| "changes_requested"
	| "pending"
	| null;
export type ChecksStatus = "success" | "failure" | "pending" | "none";
type CheckStatus = "success" | "failure" | "pending" | "skipped" | "cancelled";

export interface PullRequestCheck {
	name: string;
	status: CheckStatus;
	url: string | null;
}

export function mapPullRequestState(
	state: GraphQLPullRequestNode["state"],
	isDraft: boolean,
): PullRequestState {
	if (state === "MERGED") return "merged";
	if (state === "CLOSED") return "closed";
	if (isDraft) return "draft";
	return "open";
}

export function mapReviewDecision(
	value: GraphQLPullRequestNode["reviewDecision"],
): ReviewDecision {
	if (value === "APPROVED") return "approved";
	if (value === "CHANGES_REQUESTED") return "changes_requested";
	if (value === "REVIEW_REQUIRED") return "pending";
	return null;
}

export function parseCheckContexts(
	nodes: GraphQLCheckContextNode[],
): PullRequestCheck[] {
	const checks = nodes
		.filter(
			(node): node is NonNullable<GraphQLCheckContextNode> => node !== null,
		)
		.map((node) => {
			if (node.__typename === "CheckRun") {
				return {
					name: node.name,
					status: mapCheckRunStatus(node.status, node.conclusion),
					url: node.detailsUrl,
					recency: getCheckRunRecency(node),
				};
			}

			return {
				name: node.context,
				status: mapStatusContextState(node.state),
				url: node.targetUrl,
				recency: getStatusContextRecency(node),
			};
		});

	const dedupedChecks = new Map<
		string,
		PullRequestCheck & {
			recency: number;
		}
	>();
	for (const check of checks) {
		const existing = dedupedChecks.get(check.name);
		if (!existing || check.recency > existing.recency) {
			dedupedChecks.set(check.name, check);
		}
	}

	return [...dedupedChecks.values()].map(
		({ recency: _recency, ...check }) => check,
	);
}

export function computeChecksStatus(checks: PullRequestCheck[]): ChecksStatus {
	if (checks.length === 0) return "none";
	if (checks.some((check) => check.status === "failure")) return "failure";
	if (checks.some((check) => check.status === "pending")) return "pending";
	return "success";
}

export function coercePullRequestState(value: string | null): PullRequestState {
	if (value === "merged" || value === "closed" || value === "draft") {
		return value;
	}
	return "open";
}

export function coerceReviewDecision(value: string | null): ReviewDecision {
	if (
		value === "approved" ||
		value === "changes_requested" ||
		value === "pending"
	) {
		return value;
	}
	return null;
}

export function coerceChecksStatus(value: string | null): ChecksStatus {
	if (value === "success" || value === "failure" || value === "pending") {
		return value;
	}
	return "none";
}

export function parseChecksJson(value: string | null): PullRequestCheck[] {
	if (!value) return [];

	try {
		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];

		return parsed.filter(
			(item): item is PullRequestCheck =>
				typeof item === "object" &&
				item !== null &&
				typeof item.name === "string" &&
				typeof item.status === "string" &&
				(item.url === null || typeof item.url === "string"),
		);
	} catch {
		return [];
	}
}

function mapCheckRunStatus(
	status: string,
	conclusion: string | null,
): CheckStatus {
	if (status !== "COMPLETED") return "pending";

	switch (conclusion) {
		case "SUCCESS":
			return "success";
		case "FAILURE":
		case "TIMED_OUT":
		case "ACTION_REQUIRED":
			return "failure";
		case "CANCELLED":
			return "cancelled";
		case "SKIPPED":
		case "NEUTRAL":
			return "skipped";
		default:
			return "pending";
	}
}

function mapStatusContextState(state: string): CheckStatus {
	switch (state) {
		case "SUCCESS":
			return "success";
		case "FAILURE":
		case "ERROR":
			return "failure";
		case "EXPECTED":
		case "PENDING":
			return "pending";
		default:
			return "pending";
	}
}

function getCheckRunRecency(
	node: Extract<GraphQLCheckContextNode, { __typename: "CheckRun" }>,
): number {
	const workflowRunId = node.checkSuite?.workflowRun?.databaseId;
	if (typeof workflowRunId === "number") {
		return workflowRunId;
	}

	const timestamp = node.completedAt ?? node.startedAt;
	if (!timestamp) {
		return 0;
	}

	const time = Date.parse(timestamp);
	return Number.isNaN(time) ? 0 : time;
}

function getStatusContextRecency(
	node: Extract<GraphQLCheckContextNode, { __typename: "StatusContext" }>,
): number {
	if (!node.createdAt) {
		return 0;
	}

	const time = Date.parse(node.createdAt);
	return Number.isNaN(time) ? 0 : time;
}
