import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findWorkspaceForPath } from "./findWorkspaceForPath";

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "find-workspace-for-path-"));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("findWorkspaceForPath", () => {
	it("matches the worktree that contains the path, including the root itself", () => {
		const workspaces = [
			{ id: "a", worktreePath: join(root, "a") },
			{ id: "b", worktreePath: join(root, "b") },
		];
		expect(findWorkspaceForPath(workspaces, join(root, "b", "src"))?.id).toBe(
			"b",
		);
		expect(findWorkspaceForPath(workspaces, join(root, "a"))?.id).toBe("a");
	});

	it("does not treat a sibling with a shared prefix as a parent", () => {
		const workspaces = [{ id: "a", worktreePath: join(root, "app") }];
		expect(
			findWorkspaceForPath(workspaces, join(root, "app-two", "src")),
		).toBeUndefined();
	});

	it("prefers the deepest worktree when one is nested in another", () => {
		const outer = join(root, "outer");
		const inner = join(outer, "vendor", "inner");
		const workspaces = [
			{ id: "outer", worktreePath: outer },
			{ id: "inner", worktreePath: inner },
		];
		expect(findWorkspaceForPath(workspaces, join(inner, "lib"))?.id).toBe(
			"inner",
		);
		expect(findWorkspaceForPath(workspaces, join(outer, "src"))?.id).toBe(
			"outer",
		);
	});

	it("resolves symlinks on either side before comparing", () => {
		const real = join(root, "real");
		mkdirSync(join(real, "src"), { recursive: true });
		const link = join(root, "link");
		symlinkSync(real, link);
		expect(
			findWorkspaceForPath([{ id: "w", worktreePath: real }], join(link, "src"))
				?.id,
		).toBe("w");
		expect(
			findWorkspaceForPath([{ id: "w", worktreePath: link }], join(real, "src"))
				?.id,
		).toBe("w");
	});

	it("skips a workspace whose checkout is gone, even at the same path", () => {
		const path = join(root, "reused");
		const workspaces = [
			{ id: "archived", worktreePath: path, worktreeExists: false },
			{ id: "live", worktreePath: path, worktreeExists: true },
			{ id: "unknown-age", worktreePath: join(root, "other") },
		];
		expect(findWorkspaceForPath(workspaces, join(path, "src"))?.id).toBe(
			"live",
		);
		expect(
			findWorkspaceForPath(workspaces, join(root, "other", "src"))?.id,
		).toBe("unknown-age");
	});

	it("returns undefined when nothing contains the path or the list is empty", () => {
		expect(findWorkspaceForPath([], join(root, "x"))).toBeUndefined();
		expect(
			findWorkspaceForPath(
				[{ id: "a", worktreePath: join(root, "a") }],
				join(root, "elsewhere"),
			),
		).toBeUndefined();
	});
});
