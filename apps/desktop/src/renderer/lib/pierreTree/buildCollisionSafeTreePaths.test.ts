import { describe, expect, it } from "bun:test";
import { buildCollisionSafeTreePaths } from "./buildCollisionSafeTreePaths";

const ZWSP = "\u200b";

/** The invariant Pierre needs: no tree path is also a directory prefix of another. */
function expectNoCollisions(treePaths: string[]) {
	const dirPrefixes = new Set<string>();
	for (const path of treePaths) {
		let slash = path.indexOf("/");
		while (slash !== -1) {
			dirPrefixes.add(path.slice(0, slash));
			slash = path.indexOf("/", slash + 1);
		}
	}
	for (const path of treePaths) {
		expect(dirPrefixes.has(path)).toBe(false);
	}
}

describe("buildCollisionSafeTreePaths", () => {
	it("passes collision-free paths through untouched", () => {
		const paths = ["a/b.ts", "a/c.ts", "d.ts"];
		const result = buildCollisionSafeTreePaths(paths);
		expect(result.treePaths).toEqual(paths);
		expect(result.toTreePath.size).toBe(0);
		expect(result.toRealPath.size).toBe(0);
	});

	it("disambiguates a file that is also a directory (file listed first)", () => {
		const result = buildCollisionSafeTreePaths([
			"skills",
			"skills/pdf/SKILL.md",
		]);
		expect(result.treePaths).toEqual([`skills${ZWSP}`, "skills/pdf/SKILL.md"]);
		expect(result.toTreePath.get("skills")).toBe(`skills${ZWSP}`);
		expect(result.toRealPath.get(`skills${ZWSP}`)).toBe("skills");
		expectNoCollisions(result.treePaths);
	});

	it("disambiguates a file that is also a directory (directory listed first)", () => {
		const result = buildCollisionSafeTreePaths([
			"skills/pdf/SKILL.md",
			"skills",
		]);
		expect(result.treePaths).toEqual(["skills/pdf/SKILL.md", `skills${ZWSP}`]);
		expect(result.toTreePath.get("skills")).toBe(`skills${ZWSP}`);
		expect(result.toRealPath.get(`skills${ZWSP}`)).toBe("skills");
		expectNoCollisions(result.treePaths);
	});

	it("handles nested collisions at multiple depths", () => {
		const result = buildCollisionSafeTreePaths(["a", "a/b", "a/b/c.ts"]);
		expect(result.treePaths).toEqual([`a${ZWSP}`, `a/b${ZWSP}`, "a/b/c.ts"]);
		expect(result.toRealPath.get(`a${ZWSP}`)).toBe("a");
		expect(result.toRealPath.get(`a/b${ZWSP}`)).toBe("a/b");
		expectNoCollisions(result.treePaths);
	});

	it("keeps every input path represented exactly once", () => {
		const paths = ["skills", "skills/pdf/SKILL.md", "skills/web/SKILL.md"];
		const { treePaths, toRealPath } = buildCollisionSafeTreePaths(paths);
		expect(treePaths).toHaveLength(paths.length);
		const realPaths = treePaths.map((p) => toRealPath.get(p) ?? p);
		expect(realPaths).toEqual(paths);
	});

	it("stays unique when a marker-suffixed path already exists", () => {
		const result = buildCollisionSafeTreePaths([
			"skills",
			`skills${ZWSP}`,
			"skills/pdf/SKILL.md",
		]);
		expect(new Set(result.treePaths).size).toBe(3);
		expect(result.toTreePath.get("skills")).toBe(`skills${ZWSP}${ZWSP}`);
		expectNoCollisions(result.treePaths);
	});
});
