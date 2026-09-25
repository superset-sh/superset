import { describe, expect, it } from "bun:test";
import { changesPillStats } from "./changesPillStats";

function file(path: string, additions: number, deletions: number) {
	return { path, additions, deletions };
}

describe("changesPillStats", () => {
	it("returns zeros for a clean tree", () => {
		expect(
			changesPillStats({ againstBase: [], staged: [], unstaged: [] }),
		).toEqual({ fileCount: 0, additions: 0, deletions: 0 });
	});

	it("sums across sections for distinct paths", () => {
		const stats = changesPillStats({
			againstBase: [file("a.ts", 10, 2)],
			staged: [file("b.ts", 3, 0)],
			unstaged: [file("c.ts", 0, 5)],
		});
		expect(stats).toEqual({ fileCount: 3, additions: 13, deletions: 7 });
	});

	it("lets working-tree entries override the against-base row for a path", () => {
		const stats = changesPillStats({
			againstBase: [file("a.ts", 100, 100)],
			staged: [],
			unstaged: [file("a.ts", 4, 1)],
		});
		expect(stats).toEqual({ fileCount: 1, additions: 4, deletions: 1 });
	});

	it("lets unstaged override staged for the same path", () => {
		const stats = changesPillStats({
			againstBase: [],
			staged: [file("a.ts", 7, 7)],
			unstaged: [file("a.ts", 2, 0)],
		});
		expect(stats).toEqual({ fileCount: 1, additions: 2, deletions: 0 });
	});
});
