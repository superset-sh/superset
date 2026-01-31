import type { LinearClient } from "@linear/sdk";
import { mapPriorityFromLinear } from "@superset/trpc/integrations/linear";
import { subMonths } from "date-fns";

export interface LinearIssue {
	id: string;
	identifier: string;
	title: string;
	description: string | null;
	priority: number;
	estimate: number | null;
	dueDate: string | null;
	createdAt: string;
	url: string;
	startedAt: string | null;
	completedAt: string | null;
	assignee: { id: string; email: string } | null;
	state: {
		id: string;
		name: string;
		color: string;
		type: string;
		position: number;
	};
	labels: { nodes: Array<{ id: string; name: string }> };
}

interface IssuesQueryResponse {
	issues: {
		pageInfo: { hasNextPage: boolean; endCursor: string | null };
		nodes: LinearIssue[];
	};
}

interface WorkflowStateWithPosition {
	name: string;
	position: number;
}

/**
 * Calculates progress percentage for "started" type workflow states
 * using Linear's rendering formula:
 * - 1 state: 50%
 * - 2 states: [50%, 75%]
 * - 3+ states: evenly spaced using (index + 1) / (total + 1)
 */
export function calculateProgressForStates(
	states: WorkflowStateWithPosition[],
): Map<string, number> {
	const progressMap = new Map<string, number>();

	if (states.length === 0) {
		return progressMap;
	}

	const sorted = [...states].sort((a, b) => a.position - b.position);

	const total = sorted.length;

	for (let i = 0; i < total; i++) {
		const state = sorted[i];
		if (!state) continue;

		let progress: number;

		if (total === 1) {
			progress = 50;
		} else if (total === 2) {
			progress = i === 0 ? 50 : 75;
		} else {
			progress = ((i + 1) / (total + 1)) * 100;
		}

		progressMap.set(state.name, Math.round(progress));
	}

	return progressMap;
}

const ISSUES_QUERY = `
  query Issues($first: Int!, $after: String, $filter: IssueFilter) {
    issues(first: $first, after: $after, filter: $filter) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        identifier
        title
        description
        priority
        estimate
        dueDate
        createdAt
        url
        startedAt
        completedAt
        assignee {
          id
          email
        }
        state {
          id
          name
          color
          type
          position
        }
        labels {
          nodes {
            id
            name
          }
        }
      }
    }
  }
`;

export async function fetchAllIssues(
	client: LinearClient,
): Promise<LinearIssue[]> {
	const allIssues: LinearIssue[] = [];
	let cursor: string | undefined;
	const threeMonthsAgo = subMonths(new Date(), 3);

	do {
		const response = await client.client.request<
			IssuesQueryResponse,
			{ first: number; after?: string; filter: object }
		>(ISSUES_QUERY, {
			first: 100,
			after: cursor,
			filter: { updatedAt: { gte: threeMonthsAgo.toISOString() } },
		});
		allIssues.push(...response.issues.nodes);
		cursor =
			response.issues.pageInfo.hasNextPage && response.issues.pageInfo.endCursor
				? response.issues.pageInfo.endCursor
				: undefined;
	} while (cursor);

	return allIssues;
}

export function mapIssueToTask(
	issue: LinearIssue,
	organizationId: string,
	creatorId: string,
	userByEmail: Map<string, string>,
	statusByExternalId: Map<string, string>,
) {
	const assigneeId = issue.assignee?.email
		? (userByEmail.get(issue.assignee.email) ?? null)
		: null;

	const statusId = statusByExternalId.get(issue.state.id);
	if (!statusId) {
		throw new Error(`Status not found for state ${issue.state.id}`);
	}

	return {
		organizationId,
		creatorId,
		slug: issue.identifier,
		title: issue.title,
		description: issue.description,
		statusId,
		priority: mapPriorityFromLinear(issue.priority),
		assigneeId,
		estimate: issue.estimate,
		dueDate: issue.dueDate ? new Date(issue.dueDate) : null,
		labels: issue.labels.nodes.map((l) => l.name),
		startedAt: issue.startedAt ? new Date(issue.startedAt) : null,
		completedAt: issue.completedAt ? new Date(issue.completedAt) : null,
		createdAt: new Date(issue.createdAt),
		externalProvider: "linear" as const,
		externalId: issue.id,
		externalKey: issue.identifier,
		externalUrl: issue.url,
		lastSyncedAt: new Date(),
	};
}
