import type { LinearClient } from "@linear/sdk";

export interface LinearIssueDetails {
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
	assignee: {
		id: string;
		email: string | null;
		name: string | null;
		avatarUrl: string | null;
	} | null;
	state: {
		id: string;
	};
	labels: {
		nodes: Array<{ id: string; name: string }>;
	};
	comments: {
		nodes: Array<{
			id: string;
			body: string | null;
			createdAt: string;
			updatedAt: string;
			url?: string | null;
			parent?: { id: string } | null;
			user?: {
				id: string;
				name: string | null;
				avatarUrl: string | null;
			} | null;
		}>;
	};
	attachments: {
		nodes: Array<{
			id: string;
			url: string | null;
			title?: string | null;
			sourceType?: string | null;
		}>;
	};
}

interface IssueDetailsResponse {
	issue: LinearIssueDetails | null;
}

const ISSUE_DETAILS_QUERY = `
	query IssueDetails($id: String!) {
		issue(id: $id) {
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
				name
				avatarUrl
			}
			state {
				id
			}
			labels {
				nodes {
					id
					name
				}
			}
			comments {
				nodes {
					id
					body
					createdAt
					updatedAt
					url
					parent {
						id
					}
					user {
						id
						name
						avatarUrl
					}
				}
			}
			attachments {
				nodes {
					id
					url
					title
					sourceType
				}
			}
		}
	}
`;

export async function fetchIssueDetails(
	client: LinearClient,
	issueId: string,
): Promise<LinearIssueDetails | null> {
	const response = await client.client.request<
		IssueDetailsResponse,
		{ id: string }
	>(ISSUE_DETAILS_QUERY, { id: issueId });

	return response.issue;
}
