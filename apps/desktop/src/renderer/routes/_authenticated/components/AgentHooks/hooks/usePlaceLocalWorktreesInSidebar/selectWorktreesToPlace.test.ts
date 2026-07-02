import { describe, expect, it } from "bun:test";
import { selectWorktreesToPlace } from "./selectWorktreesToPlace";

describe("selectWorktreesToPlace", () => {
	it("places worktrees that have no local-state row", () => {
		const result = selectWorktreesToPlace(
			[{ id: "wt-1", projectId: "p1", type: "worktree" }],
			new Set(),
		);

		expect(result).toEqual([{ id: "wt-1", projectId: "p1" }]);
	});

	it("never places main workspaces — they surface via the gated path", () => {
		const result = selectWorktreesToPlace(
			[
				{ id: "main-1", projectId: "p1", type: "main" },
				{ id: "wt-1", projectId: "p1", type: "worktree" },
			],
			new Set(),
		);

		expect(result).toEqual([{ id: "wt-1", projectId: "p1" }]);
	});

	it("skips worktrees that already have a row (placed, hidden, or removed)", () => {
		const result = selectWorktreesToPlace(
			[
				{ id: "wt-seen", projectId: "p1", type: "worktree" },
				{ id: "wt-new", projectId: "p1", type: "worktree" },
			],
			new Set(["wt-seen"]),
		);

		expect(result).toEqual([{ id: "wt-new", projectId: "p1" }]);
	});
});
