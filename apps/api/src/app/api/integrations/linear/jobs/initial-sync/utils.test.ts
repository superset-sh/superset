import { describe, expect, mock, test } from "bun:test";

mock.module("@superset/trpc/integrations/linear", () => ({
	mapPriorityFromLinear: (priority: number) => {
		switch (priority) {
			case 1:
				return "urgent";
			case 2:
				return "high";
			case 3:
				return "medium";
			case 4:
				return "low";
			default:
				return "none";
		}
	},
}));

const { mapIssueToTask } = await import("./utils");

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const CREATOR_ID = "00000000-0000-4000-8000-000000000002";

function makeIssue(
	overrides: Partial<Parameters<typeof mapIssueToTask>[0]> = {},
) {
	return {
		id: "issue-1",
		identifier: "TEAM-1",
		title: "Test issue",
		description: null,
		priority: 0,
		estimate: null,
		dueDate: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		url: "https://linear.app/example/issue/TEAM-1",
		startedAt: null,
		completedAt: null,
		assignee: null,
		state: {
			id: "state-known",
			name: "Backlog",
			color: "#000",
			type: "backlog",
			position: 0,
		},
		labels: { nodes: [] },
		...overrides,
	} as Parameters<typeof mapIssueToTask>[0];
}

describe("mapIssueToTask — issue #4184", () => {
	test("returns null for issues whose workflow state isn't in the synced map", () => {
		// Repro: when syncWorkflowStates only syncs states for the first page
		// of teams returned by `client.teams()` (Linear SDK default), any issue
		// fetched by `fetchAllIssues` that belongs to a team beyond that first
		// page references a state.id that was never inserted into
		// `statusByExternalId`. Previously this threw, aborting `issues.map(...)`
		// in performInitialSync and preventing *any* Linear issues from being
		// inserted (matching "existing Linear issues are not pulled into
		// Superset at all" in the bug report). Now we skip the issue instead
		// so the rest of the batch still syncs.
		const statusByExternalId = new Map<string, string>([
			["state-known", "11111111-1111-4111-8111-111111111111"],
		]);
		const userByEmail = new Map<string, string>();

		const result = mapIssueToTask(
			makeIssue({
				id: "issue-from-unsynced-team",
				state: {
					id: "state-from-unsynced-team",
					name: "In Review",
					color: "#abc",
					type: "started",
					position: 1,
				},
			}),
			ORGANIZATION_ID,
			CREATOR_ID,
			userByEmail,
			statusByExternalId,
		);

		expect(result).toBeNull();
	});

	test("a single issue with an unsynced state no longer aborts the whole batch", () => {
		// performInitialSync builds taskValues via `issues.map(mapIssueToTask)`
		// then `.filter(v => v !== null)`. A single bad issue must not block
		// the rest from being mapped and inserted.
		const statusByExternalId = new Map<string, string>([
			["state-known", "11111111-1111-4111-8111-111111111111"],
		]);
		const userByEmail = new Map<string, string>();

		const issues = [
			makeIssue({ id: "issue-good-1", identifier: "TEAM-1" }),
			makeIssue({
				id: "issue-bad",
				identifier: "TEAM-2",
				state: {
					id: "state-from-unsynced-team",
					name: "In Review",
					color: "#abc",
					type: "started",
					position: 1,
				},
			}),
			makeIssue({ id: "issue-good-2", identifier: "TEAM-3" }),
		];

		const mapped = issues
			.map((issue) =>
				mapIssueToTask(
					issue,
					ORGANIZATION_ID,
					CREATOR_ID,
					userByEmail,
					statusByExternalId,
				),
			)
			.filter((value): value is NonNullable<typeof value> => value !== null);

		expect(mapped).toHaveLength(2);
		expect(mapped.map((t) => t.externalId)).toEqual([
			"issue-good-1",
			"issue-good-2",
		]);
	});

	test("maps a normal issue with a known state into a task row", () => {
		const statusByExternalId = new Map<string, string>([
			["state-known", "11111111-1111-4111-8111-111111111111"],
		]);
		const userByEmail = new Map<string, string>([
			["jane@example.com", "22222222-2222-4222-8222-222222222222"],
		]);

		const result = mapIssueToTask(
			makeIssue({
				id: "issue-normal",
				identifier: "TEAM-99",
				title: "A real task",
				priority: 2,
				assignee: {
					id: "linear-user-1",
					email: "jane@example.com",
					name: "Jane",
					avatarUrl: null,
				},
			}),
			ORGANIZATION_ID,
			CREATOR_ID,
			userByEmail,
			statusByExternalId,
		);

		expect(result).not.toBeNull();
		expect(result).toMatchObject({
			organizationId: ORGANIZATION_ID,
			creatorId: CREATOR_ID,
			externalId: "issue-normal",
			externalKey: "TEAM-99",
			externalProvider: "linear",
			statusId: "11111111-1111-4111-8111-111111111111",
			priority: "high",
			assigneeId: "22222222-2222-4222-8222-222222222222",
			assigneeExternalId: null,
		});
	});
});
