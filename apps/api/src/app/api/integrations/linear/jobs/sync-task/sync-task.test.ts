import { describe, expect, test } from "bun:test";

/**
 * Reproduction test for GitHub issue #2434:
 * "Linear sync is not bidirectional. Only Linear -> Superset."
 *
 * Root cause: The sync-task POST handler requires `resolvedTeamId` for ALL
 * sync operations — including updates to tasks that already have an
 * `externalProvider === "linear"` and `externalId`. When `newTasksTeamId` is
 * not configured (common on fresh connections), the handler returns early with
 * "No team configured" and skips the sync entirely, even though Linear's
 * `updateIssue` API does not need a team ID.
 *
 * This means:
 *  - Linear → Superset works (webhooks + initial sync)
 *  - Superset → Linear is silently blocked for all tasks if no team is configured
 */

// ---------------------------------------------------------------------------
// Minimal types mirroring the route's dependencies
// ---------------------------------------------------------------------------

interface Task {
	id: string;
	organizationId: string;
	externalProvider: string | null;
	externalId: string | null;
	externalKey: string | null;
	externalUrl: string | null;
	title: string;
	description: string | null;
	priority: "urgent" | "high" | "medium" | "low" | "none";
	statusId: string;
	assigneeId: string | null;
	assigneeExternalId: string | null;
	estimate: number | null;
	dueDate: Date | null;
	lastSyncedAt: Date | null;
	syncError: string | null;
}

// ---------------------------------------------------------------------------
// Extract the gating logic from the POST handler to test it in isolation.
//
// This mirrors lines 252-266 of route.ts:
//
//   const resolvedTeamId = teamId ?? (await getNewTasksTeamId(task.organizationId));
//   if (!resolvedTeamId) {
//       return Response.json({ error: "No team configured", skipped: true });
//   }
//
// The bug: this gate applies to ALL tasks, including updates to existing
// Linear-linked tasks that don't need a team to call updateIssue.
// ---------------------------------------------------------------------------

function shouldSkipSync_BUGGY(
	_task: Task,
	payloadTeamId: string | undefined,
	configuredTeamId: string | null,
): { skip: boolean; resolvedTeamId: string | null } {
	const resolvedTeamId = payloadTeamId ?? configuredTeamId;
	if (!resolvedTeamId) {
		return { skip: true, resolvedTeamId: null };
	}
	return { skip: false, resolvedTeamId };
}

function shouldSkipSync_FIXED(
	task: Task,
	payloadTeamId: string | undefined,
	configuredTeamId: string | null,
): { skip: boolean; resolvedTeamId: string | null } {
	const resolvedTeamId = payloadTeamId ?? configuredTeamId;

	// For existing Linear tasks, we don't need a team ID to update them
	const isExistingLinearTask =
		task.externalProvider === "linear" && task.externalId;

	if (!resolvedTeamId && !isExistingLinearTask) {
		return { skip: true, resolvedTeamId: null };
	}
	return { skip: false, resolvedTeamId };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		organizationId: "org-1",
		externalProvider: null,
		externalId: null,
		externalKey: null,
		externalUrl: null,
		title: "Test task",
		description: null,
		priority: "medium",
		statusId: "status-1",
		assigneeId: null,
		assigneeExternalId: null,
		estimate: null,
		dueDate: null,
		lastSyncedAt: null,
		syncError: null,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sync-task: teamId gating logic (issue #2434)", () => {
	describe("BUG: current behavior blocks updates to existing Linear tasks when no team configured", () => {
		test("existing Linear task update is skipped when newTasksTeamId is not configured", () => {
			const task = makeTask({
				externalProvider: "linear",
				externalId: "linear-issue-123",
				externalKey: "ENG-42",
			});

			const result = shouldSkipSync_BUGGY(
				task,
				undefined, // no teamId in payload
				null, // no newTasksTeamId configured
			);

			// BUG: This returns skip=true, which means Superset -> Linear sync
			// is silently blocked for tasks that came FROM Linear.
			expect(result.skip).toBe(true);
		});

		test("new Superset task creation is correctly skipped when no team configured", () => {
			const task = makeTask({
				externalProvider: null,
				externalId: null,
			});

			const result = shouldSkipSync_BUGGY(
				task,
				undefined,
				null, // no newTasksTeamId configured
			);

			// Correct: can't create a Linear issue without a team
			expect(result.skip).toBe(true);
		});
	});

	describe("FIX: existing Linear tasks should sync even without team configured", () => {
		test("existing Linear task update proceeds when newTasksTeamId is not configured", () => {
			const task = makeTask({
				externalProvider: "linear",
				externalId: "linear-issue-123",
				externalKey: "ENG-42",
			});

			const result = shouldSkipSync_FIXED(
				task,
				undefined, // no teamId in payload
				null, // no newTasksTeamId configured
			);

			// FIXED: should NOT skip — updateIssue doesn't require a team
			expect(result.skip).toBe(false);
		});

		test("new Superset task creation still requires team to be configured", () => {
			const task = makeTask({
				externalProvider: null,
				externalId: null,
			});

			const result = shouldSkipSync_FIXED(task, undefined, null);

			// Still correctly skipped: createIssue needs a team
			expect(result.skip).toBe(true);
		});

		test("existing Linear task sync works when team IS configured", () => {
			const task = makeTask({
				externalProvider: "linear",
				externalId: "linear-issue-123",
			});

			const result = shouldSkipSync_FIXED(
				task,
				undefined,
				"team-abc", // team configured
			);

			expect(result.skip).toBe(false);
			expect(result.resolvedTeamId).toBe("team-abc");
		});

		test("new task creation works when team IS configured", () => {
			const task = makeTask({
				externalProvider: null,
				externalId: null,
			});

			const result = shouldSkipSync_FIXED(task, undefined, "team-abc");

			expect(result.skip).toBe(false);
			expect(result.resolvedTeamId).toBe("team-abc");
		});

		test("payload teamId takes precedence over configured team", () => {
			const task = makeTask({
				externalProvider: "linear",
				externalId: "linear-issue-123",
			});

			const result = shouldSkipSync_FIXED(
				task,
				"payload-team",
				"configured-team",
			);

			expect(result.skip).toBe(false);
			expect(result.resolvedTeamId).toBe("payload-team");
		});
	});
});

describe("sync-task: syncTaskToLinear update path should not require teamId", () => {
	test("update path only needs externalId, not teamId, for the Linear API call", () => {
		// This test documents that Linear's updateIssue(externalId, data)
		// does NOT take a teamId parameter. The teamId is only used for:
		// 1. findLinearState (status mapping) — optional for updates
		// 2. createIssue — required for new issues
		//
		// Therefore, the syncTaskToLinear function should accept a null
		// teamId for the update path, and just skip state resolution.

		const task = makeTask({
			externalProvider: "linear",
			externalId: "linear-issue-123",
		});

		// The update path (lines 114-161 of route.ts) calls:
		//   client.updateIssue(task.externalId, { title, description, ... stateId })
		// where stateId can be undefined (which means "don't change state").
		//
		// So when teamId is null, we should still proceed with the update
		// and just pass stateId as undefined.
		const teamId: string | null = null;
		const isExistingLinearTask =
			task.externalProvider === "linear" && task.externalId;

		expect(isExistingLinearTask).toBeTruthy();
		// stateId would be undefined when no teamId → update still proceeds
		const stateId = teamId ? "would-resolve-state" : undefined;
		expect(stateId).toBeUndefined();
	});
});
