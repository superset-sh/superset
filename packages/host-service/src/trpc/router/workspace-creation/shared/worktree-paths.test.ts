import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	isInsideProjectWorktreesRoot,
	resolveProjectWorktreesFolder,
	safeResolveWorktreePath,
} from "./worktree-paths";

const PROJECT_ID = "1c99c8eb-1b31-4f04-9ac4-61a2760c74b6";
const proj = { id: "proj", name: "" };

describe("resolveProjectWorktreesFolder", () => {
	test("names the folder after the project, not its id", () => {
		expect(
			resolveProjectWorktreesFolder({ id: PROJECT_ID, name: "superset" }, [
				"other",
			]),
		).toBe("superset");
	});

	test("falls back to the id when the name yields no folder", () => {
		for (const name of ["", "   ", "..", "."]) {
			expect(resolveProjectWorktreesFolder({ id: PROJECT_ID, name }, [])).toBe(
				PROJECT_ID,
			);
		}
	});

	test("suffixes a name another project on the host already uses", () => {
		expect(
			resolveProjectWorktreesFolder({ id: PROJECT_ID, name: "Superset" }, [
				"superset",
			]),
		).toBe("Superset-1c99c8eb");
	});

	test("keeps path separators and reserved characters out of the folder", () => {
		expect(
			resolveProjectWorktreesFolder(
				{ id: PROJECT_ID, name: "../acme/web:app  v2. " },
				[],
			),
		).toBe("-acme-web-app v2");
	});
});

describe("safeResolveWorktreePath", () => {
	test("places a prefixed branch at <base>/<project name>/<prefix>/<branch>", () => {
		const folder = resolveProjectWorktreesFolder(
			{ id: PROJECT_ID, name: "superset" },
			[],
		);
		expect(safeResolveWorktreePath(folder, "lazar/fix-login", "/wt")).toBe(
			join("/wt", "superset", "lazar", "fix-login"),
		);
	});

	test("rejects a branch that escapes the project folder", () => {
		expect(() =>
			safeResolveWorktreePath("superset", "../other/x", "/wt"),
		).toThrow("path traversal");
	});
});

describe("isInsideProjectWorktreesRoot", () => {
	const dirs: string[] = [];
	const tmp = (prefix: string) => {
		const d = mkdtempSync(join(tmpdir(), prefix));
		dirs.push(d);
		return d;
	};
	afterEach(() => {
		for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
	});

	test("accepts a worktree beneath <base>/<projectId>", () => {
		const base = tmp("wt-base-");
		mkdirSync(join(base, "proj", "feature"), { recursive: true });
		expect(
			isInsideProjectWorktreesRoot(join(base, "proj", "feature"), proj, base),
		).toBe(true);
	});

	test("rejects the project root itself, siblings, and paths outside the base", () => {
		const base = tmp("wt-base-");
		mkdirSync(join(base, "proj"), { recursive: true });
		expect(isInsideProjectWorktreesRoot(join(base, "proj"), proj, base)).toBe(
			false,
		);
		expect(
			isInsideProjectWorktreesRoot(join(base, "other", "x"), proj, base),
		).toBe(false);
		expect(
			isInsideProjectWorktreesRoot(join(tmp("elsewhere-"), "x"), proj, base),
		).toBe(false);
	});

	test("accepts a dangling symlink leaf under a base that itself sits behind a symlink", () => {
		// tmpdir() on macOS is /var/..., a symlink to /private/var/...: the
		// base canonicalises to /private/var while an unresolvable leaf used
		// to fall back to its /var/... spelling and never share the prefix.
		const base = tmp("wt-base-");
		mkdirSync(join(base, "proj"), { recursive: true });
		symlinkSync(join(base, "gone"), join(base, "proj", "feature"));
		expect(
			isInsideProjectWorktreesRoot(join(base, "proj", "feature"), proj, base),
		).toBe(true);
	});

	test("accepts the name folder, its suffixed form, and the legacy id folder", () => {
		const base = tmp("wt-base-");
		const project = { id: PROJECT_ID, name: "superset" };
		for (const folder of ["superset", "superset-1c99c8eb", PROJECT_ID]) {
			mkdirSync(join(base, folder, "feature"), { recursive: true });
			expect(
				isInsideProjectWorktreesRoot(
					join(base, folder, "feature"),
					project,
					base,
				),
			).toBe(true);
		}
		mkdirSync(join(base, "unrelated", "feature"), { recursive: true });
		expect(
			isInsideProjectWorktreesRoot(
				join(base, "unrelated", "feature"),
				project,
				base,
			),
		).toBe(false);
	});

	test("rejects a leaf symlink that points out of the base", () => {
		const base = tmp("wt-base-");
		const outside = tmp("wt-outside-");
		mkdirSync(join(base, "proj"), { recursive: true });
		symlinkSync(outside, join(base, "proj", "feature"));
		expect(
			isInsideProjectWorktreesRoot(join(base, "proj", "feature"), proj, base),
		).toBe(false);
	});

	test("rejects a worktree under a project root that is a symlink out of the base", () => {
		const base = tmp("wt-base-");
		const outside = tmp("wt-outside-");
		mkdirSync(join(outside, "feature"), { recursive: true });
		symlinkSync(outside, join(base, "proj"));
		expect(
			isInsideProjectWorktreesRoot(join(base, "proj", "feature"), proj, base),
		).toBe(false);
	});
});
