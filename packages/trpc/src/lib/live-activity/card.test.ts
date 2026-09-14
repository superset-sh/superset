import { describe, expect, it } from "bun:test";
import { buildCardContentState } from "./card";

const labels = {
	working: "Working",
	review: "Review",
	permission: "Needs you",
	failed: "Failed",
	more: "+{n} more",
};

function row(
	terminalId: string,
	state: "working" | "review" | "permission" | "failed",
	sinceMs: number,
	projectId: string | null = "p1",
) {
	return {
		terminalId,
		workspaceId: `ws-${terminalId}`,
		workspaceName: `Workspace ${terminalId}`,
		projectId,
		projectName: projectId ? "superset" : null,
		state,
		sinceAt: new Date(sinceMs),
	};
}

describe("buildCardContentState", () => {
	it("orders by what wants you, then recency, and caps at four", () => {
		const fleet = [
			row("a", "working", 5),
			row("b", "review", 3),
			row("c", "permission", 1),
			row("d", "working", 6),
			row("e", "failed", 2),
			row("f", "review", 4),
		];
		const card = buildCardContentState({ fleet, labels });
		expect(card.rows.map((r) => r.id)).toEqual(["c", "e", "f", "b"]);
		expect(card.more).toBe("+2 more");
		expect(card.totalCount).toBe(6);
		expect(card.topState).toBe("permission");
	});

	it("translates status words and names the cached icon by project", () => {
		const card = buildCardContentState({
			fleet: [row("a", "permission", 1_000), row("b", "working", 2_000, null)],
			labels,
		});
		expect(card.rows[0]).toEqual({
			id: "a",
			workspaceId: "ws-a",
			name: "Workspace a",
			project: "superset",
			iconFile: "p1.png",
			status: "Needs you",
			state: "permission",
			since: 1_000,
			isQuiet: false,
		});
		expect(card.rows[1]?.iconFile).toBeNull();
		expect(card.rows[1]?.project).toBe("");
		expect(card.more).toBeNull();
	});
});
