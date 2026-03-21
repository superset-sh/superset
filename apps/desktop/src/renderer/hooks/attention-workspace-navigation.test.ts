import { describe, expect, it } from "bun:test";
import { findNextAttentionWorkspace } from "./attention-workspace-navigation";

describe("findNextAttentionWorkspace", () => {
	const allWorkspaceIds = ["ws-1", "ws-2", "ws-3", "ws-4", "ws-5"];

	describe("next direction", () => {
		it("returns null when no workspaces need attention", () => {
			const result = findNextAttentionWorkspace(
				allWorkspaceIds,
				[],
				"ws-2",
				"next",
			);
			expect(result).toBeNull();
		});

		it("jumps to the next attention workspace after current", () => {
			const result = findNextAttentionWorkspace(
				allWorkspaceIds,
				["ws-1", "ws-4"],
				"ws-2",
				"next",
			);
			expect(result).toBe("ws-4");
		});

		it("wraps around when current is after the last attention workspace", () => {
			const result = findNextAttentionWorkspace(
				allWorkspaceIds,
				["ws-1", "ws-3"],
				"ws-4",
				"next",
			);
			expect(result).toBe("ws-1");
		});

		it("jumps to next when current workspace itself needs attention", () => {
			const result = findNextAttentionWorkspace(
				allWorkspaceIds,
				["ws-2", "ws-4"],
				"ws-2",
				"next",
			);
			expect(result).toBe("ws-4");
		});

		it("wraps around when current is the last attention workspace", () => {
			const result = findNextAttentionWorkspace(
				allWorkspaceIds,
				["ws-1", "ws-4"],
				"ws-4",
				"next",
			);
			expect(result).toBe("ws-1");
		});

		it("returns the only attention workspace when there is just one and current is different", () => {
			const result = findNextAttentionWorkspace(
				allWorkspaceIds,
				["ws-3"],
				"ws-1",
				"next",
			);
			expect(result).toBe("ws-3");
		});

		it("returns the same workspace when it is the only attention workspace", () => {
			const result = findNextAttentionWorkspace(
				allWorkspaceIds,
				["ws-3"],
				"ws-3",
				"next",
			);
			expect(result).toBe("ws-3");
		});
	});

	describe("prev direction", () => {
		it("returns null when no workspaces need attention", () => {
			const result = findNextAttentionWorkspace(
				allWorkspaceIds,
				[],
				"ws-2",
				"prev",
			);
			expect(result).toBeNull();
		});

		it("jumps to the previous attention workspace before current", () => {
			const result = findNextAttentionWorkspace(
				allWorkspaceIds,
				["ws-1", "ws-4"],
				"ws-3",
				"prev",
			);
			expect(result).toBe("ws-1");
		});

		it("wraps around when current is before the first attention workspace", () => {
			const result = findNextAttentionWorkspace(
				allWorkspaceIds,
				["ws-3", "ws-5"],
				"ws-1",
				"prev",
			);
			expect(result).toBe("ws-5");
		});

		it("jumps to previous when current workspace itself needs attention", () => {
			const result = findNextAttentionWorkspace(
				allWorkspaceIds,
				["ws-2", "ws-4"],
				"ws-4",
				"prev",
			);
			expect(result).toBe("ws-2");
		});

		it("wraps around when current is the first attention workspace", () => {
			const result = findNextAttentionWorkspace(
				allWorkspaceIds,
				["ws-1", "ws-4"],
				"ws-1",
				"prev",
			);
			expect(result).toBe("ws-4");
		});
	});

	describe("edge cases", () => {
		it("handles current workspace not in allWorkspaceIds", () => {
			const result = findNextAttentionWorkspace(
				allWorkspaceIds,
				["ws-3"],
				"ws-unknown",
				"next",
			);
			// When current is not found, should still return the first attention workspace
			expect(result).toBe("ws-3");
		});

		it("handles empty allWorkspaceIds", () => {
			const result = findNextAttentionWorkspace([], [], "ws-1", "next");
			expect(result).toBeNull();
		});
	});
});
