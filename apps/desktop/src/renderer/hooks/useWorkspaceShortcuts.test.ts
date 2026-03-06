import { describe, expect, test } from "bun:test";
import { getUncollapsedWorkspaces } from "./workspaceShortcutsUtils";

const makeGroup = (projectId: string, workspaceIds: string[]) => ({
	project: { id: projectId },
	workspaces: workspaceIds.map((id) => ({ id })),
});

describe("getUncollapsedWorkspaces", () => {
	test("returns all workspaces when no projects are collapsed", () => {
		const groups = [
			makeGroup("proj-a", ["ws-1", "ws-2"]),
			makeGroup("proj-b", ["ws-3"]),
		];
		const result = getUncollapsedWorkspaces(groups, []);
		expect(result.map((w) => w.id)).toEqual(["ws-1", "ws-2", "ws-3"]);
	});

	test("excludes workspaces from collapsed projects", () => {
		const groups = [
			makeGroup("proj-a", ["ws-1", "ws-2"]),
			makeGroup("proj-b", ["ws-3"]),
			makeGroup("proj-c", ["ws-4"]),
		];
		const result = getUncollapsedWorkspaces(groups, ["proj-b"]);
		expect(result.map((w) => w.id)).toEqual(["ws-1", "ws-2", "ws-4"]);
	});

	test("shortcut indices only cover uncollapsed workspaces", () => {
		// proj-a is collapsed, so CMD+1 should go to ws-3 (first uncollapsed workspace)
		// not ws-1 (which belongs to collapsed proj-a)
		const groups = [
			makeGroup("proj-a", ["ws-1", "ws-2"]),
			makeGroup("proj-b", ["ws-3", "ws-4"]),
		];
		const result = getUncollapsedWorkspaces(groups, ["proj-a"]);
		expect(result[0]?.id).toBe("ws-3"); // CMD+1 → ws-3
		expect(result[1]?.id).toBe("ws-4"); // CMD+2 → ws-4
		expect(result).toHaveLength(2);
	});

	test("returns empty array when all projects are collapsed", () => {
		const groups = [
			makeGroup("proj-a", ["ws-1"]),
			makeGroup("proj-b", ["ws-2"]),
		];
		const result = getUncollapsedWorkspaces(groups, ["proj-a", "proj-b"]);
		expect(result).toEqual([]);
	});

	test("returns empty array for empty groups", () => {
		const result = getUncollapsedWorkspaces([], []);
		expect(result).toEqual([]);
	});
});
