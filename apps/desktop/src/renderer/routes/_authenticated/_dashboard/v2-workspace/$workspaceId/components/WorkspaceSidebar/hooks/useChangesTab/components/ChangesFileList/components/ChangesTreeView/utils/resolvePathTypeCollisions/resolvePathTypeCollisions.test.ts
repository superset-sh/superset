import { describe, expect, test } from "bun:test";
import { resolvePathTypeCollisions } from "./resolvePathTypeCollisions";

/** No surviving path may also be an implied directory of another survivor. */
function assertNoCollisions(paths: string[]) {
	const impliedDirectories = new Set<string>();
	for (const path of paths) {
		const segments = path.split("/");
		let acc = "";
		for (let i = 0; i < segments.length - 1; i++) {
			acc = acc ? `${acc}/${segments[i]}` : segments[i];
			impliedDirectories.add(acc);
		}
	}
	for (const path of paths) expect(impliedDirectories.has(path)).toBe(false);
}

describe("resolvePathTypeCollisions", () => {
	test("folds the leaf when a tracked directory was replaced by a symlink", () => {
		// git: " D pkg/skills/my-skill/SKILL.md" + "?? pkg/skills/my-skill"
		const { paths, foldedPaths } = resolvePathTypeCollisions([
			"pkg/skills/my-skill/SKILL.md",
			"pkg/skills/my-skill",
		]);

		expect(paths).toEqual(["pkg/skills/my-skill/SKILL.md"]);
		expect([...foldedPaths]).toEqual(["pkg/skills/my-skill"]);
		assertNoCollisions(paths);
	});

	test("folds the leaf when a tracked symlink was replaced by a directory", () => {
		// git under -uall: " D .claude/skills/x" + "?? .claude/skills/x/SKILL.md"
		const { paths, foldedPaths } = resolvePathTypeCollisions([
			".claude/skills/x",
			".claude/skills/x/SKILL.md",
		]);

		expect(paths).toEqual([".claude/skills/x/SKILL.md"]);
		expect([...foldedPaths]).toEqual([".claude/skills/x"]);
		assertNoCollisions(paths);
	});

	test("resolves the same regardless of input order", () => {
		const forward = resolvePathTypeCollisions(["a/b", "a/b/c.txt"]);
		const reverse = resolvePathTypeCollisions(["a/b/c.txt", "a/b"]);

		expect(forward.paths).toEqual(reverse.paths);
		expect([...forward.foldedPaths]).toEqual([...reverse.foldedPaths]);
	});

	test("folds a leaf displaced by a deeply nested descendant", () => {
		const { paths, foldedPaths } = resolvePathTypeCollisions([
			"a/b",
			"a/b/c/d/e.txt",
		]);

		expect(paths).toEqual(["a/b/c/d/e.txt"]);
		expect([...foldedPaths]).toEqual(["a/b"]);
	});

	test("folds every colliding leaf independently", () => {
		const { paths, foldedPaths } = resolvePathTypeCollisions([
			"one/link",
			"one/link/file.txt",
			"two/link",
			"two/link/file.txt",
			"kept/file.txt",
		]);

		expect(paths).toEqual([
			"one/link/file.txt",
			"two/link/file.txt",
			"kept/file.txt",
		]);
		expect([...foldedPaths].sort()).toEqual(["one/link", "two/link"]);
		assertNoCollisions(paths);
	});

	test("folds a collision at the repository root", () => {
		const { paths, foldedPaths } = resolvePathTypeCollisions([
			"skills",
			"skills/SKILL.md",
		]);

		expect(paths).toEqual(["skills/SKILL.md"]);
		expect([...foldedPaths]).toEqual(["skills"]);
	});

	test("returns the original array identity when nothing collides", () => {
		const input = ["src/a.ts", "src/nested/b.ts", "README.md"];
		const { paths, foldedPaths } = resolvePathTypeCollisions(input);

		// Identity matters: `paths` feeds a useMemo and model.resetPaths.
		expect(paths).toBe(input);
		expect(foldedPaths.size).toBe(0);
	});

	test("does not treat a shared name prefix as a collision", () => {
		const input = ["src/link", "src/link-target/file.txt"];
		const { paths, foldedPaths } = resolvePathTypeCollisions(input);

		expect(paths).toBe(input);
		expect(foldedPaths.size).toBe(0);
	});

	test("handles an empty list", () => {
		const { paths, foldedPaths } = resolvePathTypeCollisions([]);

		expect(paths).toEqual([]);
		expect(foldedPaths.size).toBe(0);
	});
});
