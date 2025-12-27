import type { LinearClient } from "@linear/sdk";
import { mapPriorityFromLinear } from "@superset/trpc/integrations/linear";

export interface LinearIssue {
	id: string;
	identifier: string;
	title: string;
	description: string | null;
	priority: number;
	estimate: number | null;
	dueDate: string | null;
	url: string;
	startedAt: string | null;
	completedAt: string | null;
	assignee: { id: string; email: string } | null;
	state: { id: string; name: string; color: string; type: string };
	labels: { nodes: Array<{ id: string; name: string }> };
}

interface IssuesQueryResponse {
	issues: {
		pageInfo: { hasNextPage: boolean; endCursor: string | null };
		nodes: LinearIssue[];
	};
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

	do {
		const response = await client.client.request<
			IssuesQueryResponse,
			{ first: number; after?: string; filter: object }
		>(ISSUES_QUERY, {
			first: 100,
			after: cursor,
			filter: { state: { type: { nin: ["canceled", "completed"] } } },
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
) {
	const assigneeId = issue.assignee?.email
		? (userByEmail.get(issue.assignee.email) ?? null)
		: null;

	return {
		organizationId,
		creatorId,
		slug: issue.identifier,
		title: issue.title,
		description: issue.description,
		status: issue.state.name,
		statusColor: issue.state.color,
		statusType: issue.state.type,
		priority: mapPriorityFromLinear(issue.priority),
		assigneeId,
		estimate: issue.estimate,
		dueDate: issue.dueDate ? new Date(issue.dueDate) : null,
		labels: issue.labels.nodes.map((l) => l.name),
		startedAt: issue.startedAt ? new Date(issue.startedAt) : null,
		completedAt: issue.completedAt ? new Date(issue.completedAt) : null,
		externalProvider: "linear" as const,
		externalId: issue.id,
		externalKey: issue.identifier,
		externalUrl: issue.url,
		lastSyncedAt: new Date(),
	};
}
