import { describe, expect, test } from "bun:test";
import type { LinearIssue } from "./utils";
import { calculateProgressForStates, mapIssueToTask } from "./utils";

function makeIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
	return {
		id: "issue-1",
		identifier: "PROJ-1",
		title: "Test issue",
		description: "A test issue",
		priority: 2,
		estimate: 3,
		dueDate: "2026-04-01",
		createdAt: "2026-01-01T00:00:00Z",
		url: "https://linear.app/team/issue/PROJ-1",
		startedAt: "2026-01-02T00:00:00Z",
		completedAt: null,
		assignee: {
			id: "user-1",
			email: "alice@example.com",
			name: "Alice",
			avatarUrl: "https://example.com/avatar.png",
		},
		state: {
			id: "state-1",
			name: "In Progress",
			color: "#0000ff",
			type: "started",
			position: 1,
		},
		labels: { nodes: [{ id: "label-1", name: "bug" }] },
		project: null,
		cycle: null,
		...overrides,
	};
}

describe("mapIssueToTask", () => {
	const orgId = "org-123";
	const creatorId = "creator-456";
	const userByEmail = new Map([["alice@example.com", "superset-user-1"]]);
	const statusByExternalId = new Map([["state-1", "status-uuid-1"]]);

	test("maps project and cycle fields when present", () => {
		const issue = makeIssue({
			project: { id: "proj-abc", name: "My Project" },
			cycle: { id: "cycle-xyz", name: "Sprint 42" },
		});

		const result = mapIssueToTask(
			issue,
			orgId,
			creatorId,
			userByEmail,
			statusByExternalId,
		);

		expect(result.externalProjectId).toBe("proj-abc");
		expect(result.externalProjectName).toBe("My Project");
		expect(result.externalCycleId).toBe("cycle-xyz");
		expect(result.externalCycleName).toBe("Sprint 42");
	});

	test("maps project/cycle to null when absent", () => {
		const issue = makeIssue({
			project: null,
			cycle: null,
		});

		const result = mapIssueToTask(
			issue,
			orgId,
			creatorId,
			userByEmail,
			statusByExternalId,
		);

		expect(result.externalProjectId).toBeNull();
		expect(result.externalProjectName).toBeNull();
		expect(result.externalCycleId).toBeNull();
		expect(result.externalCycleName).toBeNull();
	});

	test("maps core fields correctly", () => {
		const issue = makeIssue();
		const result = mapIssueToTask(
			issue,
			orgId,
			creatorId,
			userByEmail,
			statusByExternalId,
		);

		expect(result.organizationId).toBe(orgId);
		expect(result.creatorId).toBe(creatorId);
		expect(result.slug).toBe("PROJ-1");
		expect(result.title).toBe("Test issue");
		expect(result.statusId).toBe("status-uuid-1");
		expect(result.assigneeId).toBe("superset-user-1");
		expect(result.externalProvider).toBe("linear");
		expect(result.externalId).toBe("issue-1");
		expect(result.externalKey).toBe("PROJ-1");
		expect(result.labels).toEqual(["bug"]);
	});

	test("stores external assignee info when no matched user", () => {
		const issue = makeIssue({
			assignee: {
				id: "ext-user-99",
				email: "unmatched@external.com",
				name: "Bob External",
				avatarUrl: "https://example.com/bob.png",
			},
		});

		const result = mapIssueToTask(
			issue,
			orgId,
			creatorId,
			userByEmail,
			statusByExternalId,
		);

		expect(result.assigneeId).toBeNull();
		expect(result.assigneeExternalId).toBe("ext-user-99");
		expect(result.assigneeDisplayName).toBe("Bob External");
		expect(result.assigneeAvatarUrl).toBe("https://example.com/bob.png");
	});

	test("throws when status not found", () => {
		const issue = makeIssue({
			state: {
				id: "unknown-state",
				name: "Unknown",
				color: "#000",
				type: "started",
				position: 0,
			},
		});

		expect(() =>
			mapIssueToTask(issue, orgId, creatorId, userByEmail, statusByExternalId),
		).toThrow("Status not found for state unknown-state");
	});

	test("maps only project without cycle", () => {
		const issue = makeIssue({
			project: { id: "proj-only", name: "Solo Project" },
			cycle: null,
		});

		const result = mapIssueToTask(
			issue,
			orgId,
			creatorId,
			userByEmail,
			statusByExternalId,
		);

		expect(result.externalProjectId).toBe("proj-only");
		expect(result.externalProjectName).toBe("Solo Project");
		expect(result.externalCycleId).toBeNull();
		expect(result.externalCycleName).toBeNull();
	});
});

describe("calculateProgressForStates", () => {
	test("returns empty map for no states", () => {
		const result = calculateProgressForStates([]);
		expect(result.size).toBe(0);
	});

	test("single state gets 50%", () => {
		const result = calculateProgressForStates([
			{ name: "In Progress", position: 1 },
		]);
		expect(result.get("In Progress")).toBe(50);
	});

	test("two states get 50% and 75%", () => {
		const result = calculateProgressForStates([
			{ name: "First", position: 1 },
			{ name: "Second", position: 2 },
		]);
		expect(result.get("First")).toBe(50);
		expect(result.get("Second")).toBe(75);
	});

	test("three states get evenly spaced percentages", () => {
		const result = calculateProgressForStates([
			{ name: "A", position: 1 },
			{ name: "B", position: 2 },
			{ name: "C", position: 3 },
		]);
		expect(result.get("A")).toBe(25);
		expect(result.get("B")).toBe(50);
		expect(result.get("C")).toBe(75);
	});
});
