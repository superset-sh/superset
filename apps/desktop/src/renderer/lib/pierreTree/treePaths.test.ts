import { describe, expect, test } from "bun:test";
import { FileTree } from "@pierre/trees";
import { resolveTreePathCollisions, stripTrailingSlash } from "./treePaths";

/**
 * Reproduction + fix for #5224: the Changes view crashes with "Path collides
 * with an existing file while creating directory" when the repo tracks a
 * symlink-to-directory (git mode 120000). The symlink shows up as a leaf path
 * while other changed paths resolve underneath the same name.
 */
const SYMLINK_COLLISION_PATHS = [
	".claude/skills/my-skill",
	".claude/skills/my-skill/SKILL.md",
];

describe("resolveTreePathCollisions", () => {
	test("@pierre/trees crashes on a symlink-to-directory collision (bug #5224)", () => {
		// Constructing the model is what the Changes view does via usePierreFileTree.
		expect(() => new FileTree({ paths: SYMLINK_COLLISION_PATHS })).toThrow(
			/Path collides with an existing file/,
		);
	});

	test("resolved paths build a @pierre/trees model without throwing", () => {
		const resolved = resolveTreePathCollisions(SYMLINK_COLLISION_PATHS);
		expect(() => new FileTree({ paths: resolved })).not.toThrow();
	});

	test("drops a leaf that is also an ancestor of another path (directory wins)", () => {
		expect(resolveTreePathCollisions(SYMLINK_COLLISION_PATHS)).toEqual([
			".claude/skills/my-skill/SKILL.md",
		]);
	});

	test("handles a leaf colliding with a deeply nested descendant", () => {
		const paths = ["pkg/mod", "pkg/mod/a/b/c.ts"];
		expect(resolveTreePathCollisions(paths)).toEqual(["pkg/mod/a/b/c.ts"]);
	});

	test("collapses exact duplicate paths", () => {
		const paths = ["src/a.ts", "src/a.ts", "src/b.ts"];
		expect(resolveTreePathCollisions(paths)).toEqual(["src/a.ts", "src/b.ts"]);
	});

	test("leaves non-colliding paths untouched and ordered", () => {
		const paths = ["src/b.ts", "src/a.ts", "docs/readme.md"];
		expect(resolveTreePathCollisions(paths)).toEqual(paths);
	});

	test("keeps a file whose name is a prefix of a sibling but not an ancestor", () => {
		// `src/foo` is not an ancestor of `src/foobar` — no trailing-slash overlap.
		const paths = ["src/foo", "src/foobar/x.ts"];
		expect(resolveTreePathCollisions(paths)).toEqual(paths);
	});

	test("is a no-op for fewer than two paths", () => {
		expect(resolveTreePathCollisions([])).toEqual([]);
		expect(resolveTreePathCollisions(["only/one.ts"])).toEqual(["only/one.ts"]);
	});
});

describe("stripTrailingSlash", () => {
	test("removes a single trailing slash and no-ops on files", () => {
		expect(stripTrailingSlash("src/dir/")).toBe("src/dir");
		expect(stripTrailingSlash("src/file.ts")).toBe("src/file.ts");
	});
});
