import { describe, expect, test } from "bun:test";
import { selectStranded } from "./archived-workspace-reconcile";

describe("selectStranded", () => {
	const rows = [
		{ id: "gone", worktreePath: "/wt/gone" },
		{ id: "stranded", worktreePath: "/wt/stranded" },
		{ id: "reused", worktreePath: "/wt/reused" },
	];

	test("picks only tombstones whose worktree survives and is unowned", () => {
		const live = new Set(["/wt/reused"]);
		const exists = (p: string) => p !== "/wt/gone";
		expect(selectStranded(rows, live, exists).map((r) => r.id)).toEqual([
			"stranded",
		]);
	});

	test("never touches a path a live row owns, even if it exists", () => {
		const live = new Set(["/wt/stranded", "/wt/reused"]);
		expect(selectStranded(rows, live, () => true).map((r) => r.id)).toEqual([
			"gone",
		]);
	});

	test("fully cleaned tombstones are left alone", () => {
		expect(selectStranded(rows, new Set(), () => false)).toEqual([]);
	});
});
