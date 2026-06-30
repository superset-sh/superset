import { describe, expect, mock, test } from "bun:test";
import type { LinearClient } from "@linear/sdk";

mock.module("@superset/trpc/integrations/linear", () => ({
	mapPriorityFromLinear: (p: number) => p,
}));

const { fetchAllIssues } = await import("./utils");
type LinearIssue = import("./utils").LinearIssue;

function makeIssue(id: string): LinearIssue {
	return {
		id,
		identifier: id,
		title: `Issue ${id}`,
		description: null,
		priority: 0,
		estimate: null,
		dueDate: null,
		createdAt: "2020-01-01T00:00:00.000Z",
		url: `https://linear.app/${id}`,
		startedAt: null,
		completedAt: null,
		assignee: null,
		state: {
			id: "state-1",
			name: "Todo",
			color: "#000",
			type: "unstarted",
			position: 0,
		},
		labels: { nodes: [] },
	};
}

/**
 * Builds a fake LinearClient that records the GraphQL variables (including the
 * `filter`) passed on each request, and returns a single page of issues.
 */
function makeFakeClient(issues: LinearIssue[]) {
	const requests: Array<{ filter?: object }> = [];
	const request = mock(
		async (_query: string, variables: { filter?: object }) => {
			requests.push(variables);
			return {
				issues: {
					pageInfo: { hasNextPage: false, endCursor: null },
					nodes: issues,
				},
			};
		},
	);

	const client = {
		client: { request },
	} as unknown as LinearClient;

	return { client, requests };
}

describe("fetchAllIssues", () => {
	test("does not silently apply a three-month updatedAt filter on initial sync", async () => {
		const { client, requests } = makeFakeClient([makeIssue("ENG-1")]);

		await fetchAllIssues(client);

		expect(requests).toHaveLength(1);
		const filter = requests[0]?.filter as
			| { updatedAt?: { gte?: string } }
			| undefined;

		// Initial sync must NOT silently drop issues older than three months.
		expect(filter?.updatedAt?.gte).toBeUndefined();
	});

	test("returns all issues regardless of age", async () => {
		const issues = [makeIssue("ENG-1"), makeIssue("ENG-2")];
		const { client } = makeFakeClient(issues);

		const result = await fetchAllIssues(client);

		expect(result).toHaveLength(2);
	});

	test("applies an updatedAt filter only when explicitly requested", async () => {
		const { client, requests } = makeFakeClient([makeIssue("ENG-1")]);
		const updatedSince = new Date("2024-01-01T00:00:00.000Z");

		await fetchAllIssues(client, { updatedSince });

		const filter = requests[0]?.filter as { updatedAt?: { gte?: string } };
		expect(filter?.updatedAt?.gte).toBe(updatedSince.toISOString());
	});
});
