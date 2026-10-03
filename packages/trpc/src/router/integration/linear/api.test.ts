import { describe, expect, mock, test } from "bun:test";
import type { LinearClient } from "@linear/sdk";
import {
	getWorkspace,
	isLinearRateLimitError,
	issueFilterFor,
	listIssues,
	updateIssue,
} from "./api";

const rawIssue = {
	id: "issue-1",
	identifier: "SUP-12",
	title: "Fix relay",
	url: "https://linear.app/acme/issue/SUP-12",
	branchName: "ada/sup-12-fix-relay",
	priority: 2,
	createdAt: "2026-09-01T00:00:00.000Z",
	updatedAt: "2026-09-02T00:00:00.000Z",
	state: {
		id: "s1",
		name: "Todo",
		type: "unstarted",
		color: "#fff",
		position: 1,
	},
	assignee: null,
	team: { id: "t1", key: "SUP", name: "Superset" },
	project: null,
	labels: { nodes: [{ id: "l1", name: "Bug", color: "#f00" }] },
};

function clientReturning(data: unknown) {
	const rawRequest = mock(async () => ({ data }));
	return {
		client: { client: { rawRequest } } as unknown as LinearClient,
		rawRequest,
	};
}

describe("issueFilterFor", () => {
	test("maps the tab filters onto Linear's issue filter", () => {
		expect(
			issueFilterFor({ teamId: "t1", status: "active", assignee: "me" }),
		).toEqual({
			team: { id: { eq: "t1" } },
			state: { type: { in: ["unstarted", "started"] } },
			assignee: { isMe: { eq: true } },
		});
	});

	test("counts triage as backlog and leaves 'all' unfiltered", () => {
		expect(issueFilterFor({ status: "backlog" }).state).toEqual({
			type: { in: ["triage", "backlog"] },
		});
		expect(issueFilterFor({ status: "all", assignee: "unassigned" })).toEqual({
			assignee: { null: true },
		});
		expect(issueFilterFor({ status: "all", assignee: "user-9" })).toEqual({
			assignee: { id: { eq: "user-9" } },
		});
	});
});

describe("listIssues", () => {
	test("flattens labels, maps priority and exposes the next cursor", async () => {
		const { client, rawRequest } = clientReturning({
			issues: {
				nodes: [rawIssue],
				pageInfo: { hasNextPage: true, endCursor: "c2" },
			},
		});
		const page = await listIssues(client, { filter: {} });
		expect(page.nextCursor).toBe("c2");
		expect(page.issues[0]?.priority).toBe("high");
		expect(page.issues[0]?.labels).toEqual([
			{ id: "l1", name: "Bug", color: "#f00" },
		]);
		expect(rawRequest.mock.calls[0]?.[0]).toContain("orderBy: updatedAt");
	});

	test("uses Linear's search when there is a term, one request per page", async () => {
		const { client, rawRequest } = clientReturning({
			searchIssues: {
				nodes: [rawIssue],
				pageInfo: { hasNextPage: false, endCursor: "c1" },
			},
		});
		const page = await listIssues(client, { filter: {}, search: "relay" });
		expect(page.nextCursor).toBeNull();
		expect(rawRequest).toHaveBeenCalledTimes(1);
		expect(rawRequest.mock.calls[0]?.[0]).toContain("searchIssues");
		expect(rawRequest.mock.calls[0]?.[1]).toMatchObject({ term: "relay" });
	});
});

describe("updateIssue", () => {
	test("sends Linear's numeric priority", async () => {
		const { client, rawRequest } = clientReturning({
			issueUpdate: {
				success: true,
				issue: { ...rawIssue, description: null },
			},
		});
		await updateIssue(client, "issue-1", { priority: "urgent" });
		expect(rawRequest.mock.calls[0]?.[1]).toEqual({
			id: "issue-1",
			input: { priority: 1 },
		});
	});

	test("throws when Linear reports failure", async () => {
		const { client } = clientReturning({
			issueUpdate: { success: false, issue: null },
		});
		await expect(updateIssue(client, "issue-1", {})).rejects.toThrow();
	});
});

describe("getWorkspace", () => {
	test("orders each team's states by workflow type, then position", async () => {
		const state = (id: string, type: string, position: number) => ({
			id,
			name: id,
			type,
			color: "#fff",
			position,
		});
		const { client } = clientReturning({
			teams: {
				nodes: [
					{
						id: "t1",
						key: "SUP",
						name: "Superset",
						states: {
							nodes: [
								state("done", "completed", 3),
								state("review", "started", 9),
								state("todo", "unstarted", 1),
								state("progress", "started", 2),
								state("triage", "triage", 0),
							],
						},
					},
				],
			},
			users: { nodes: [] },
		});
		const workspace = await getWorkspace(client);
		expect(workspace.teams[0]?.states.map((s) => s.id)).toEqual([
			"triage",
			"todo",
			"progress",
			"review",
			"done",
		]);
	});
});

describe("isLinearRateLimitError", () => {
	test("recognises both the SDK error type and the GraphQL code", () => {
		expect(isLinearRateLimitError({ type: "Ratelimited" })).toBe(true);
		expect(
			isLinearRateLimitError({
				errors: [{ extensions: { code: "RATELIMITED" } }],
			}),
		).toBe(true);
		expect(isLinearRateLimitError(new Error("boom"))).toBe(false);
	});
});
