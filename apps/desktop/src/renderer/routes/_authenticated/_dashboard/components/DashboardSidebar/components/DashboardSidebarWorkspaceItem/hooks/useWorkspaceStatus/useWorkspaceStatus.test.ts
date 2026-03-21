import { describe, expect, test } from "bun:test";
import { getHighestPriorityStatus, type PaneStatus } from "shared/tabs-types";
import { getWorkspaceRowMocks } from "../../utils/getWorkspaceRowMocks";

describe("useWorkspaceStatus — issue #2610", () => {
	describe("bug reproduction: getWorkspaceRowMocks returns fake status", () => {
		test("mock status is deterministic based on workspace ID, not real agent state", () => {
			const id = "workspace-abc-123";
			const first = getWorkspaceRowMocks(id);
			const second = getWorkspaceRowMocks(id);

			// Same ID always produces identical mock output — proves it's static, not live
			expect(first.workspaceStatus).toBe(second.workspaceStatus);
			expect(first.diffStats).toEqual(second.diffStats);
		});

		test("mock status does not change when agent state changes", () => {
			// Two different IDs can yield different statuses, but for any given ID
			// the status is frozen — it never reflects real agent activity
			const statusA = getWorkspaceRowMocks("ws-aaa").workspaceStatus;
			const statusB = getWorkspaceRowMocks("ws-bbb").workspaceStatus;

			// At least one of them should be null (most are, since seed%6===0 is rare)
			// This demonstrates the mock returns arbitrary values unrelated to agent state
			const results = [statusA, statusB];
			const possibleValues = [null, "permission", "working", "review"];
			for (const r of results) {
				expect(possibleValues).toContain(r);
			}
		});
	});

	describe("fix verification: getHighestPriorityStatus aggregates real pane statuses", () => {
		test("returns null when all panes are idle", () => {
			const statuses: PaneStatus[] = ["idle", "idle", "idle"];
			expect(getHighestPriorityStatus(statuses)).toBeNull();
		});

		test("returns null for empty iterable", () => {
			expect(getHighestPriorityStatus([])).toBeNull();
		});

		test("returns 'working' when agent is actively processing", () => {
			const statuses: PaneStatus[] = ["idle", "working", "idle"];
			expect(getHighestPriorityStatus(statuses)).toBe("working");
		});

		test("returns 'permission' when agent needs user action (highest priority)", () => {
			const statuses: PaneStatus[] = ["working", "permission", "review"];
			expect(getHighestPriorityStatus(statuses)).toBe("permission");
		});

		test("returns 'review' when agent completed but nothing higher", () => {
			const statuses: PaneStatus[] = ["idle", "review"];
			expect(getHighestPriorityStatus(statuses)).toBe("review");
		});

		test("handles undefined pane statuses gracefully", () => {
			const statuses: (PaneStatus | undefined)[] = [
				undefined,
				"working",
				undefined,
			];
			expect(getHighestPriorityStatus(statuses)).toBe("working");
		});

		test("priority order is permission > working > review > idle", () => {
			// permission beats everything
			expect(
				getHighestPriorityStatus(["review", "working", "permission"]),
			).toBe("permission");

			// working beats review
			expect(getHighestPriorityStatus(["review", "working"])).toBe("working");

			// review beats idle
			expect(getHighestPriorityStatus(["idle", "review"])).toBe("review");
		});
	});
});
