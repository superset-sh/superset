import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	isPermissionDenied,
	removeDirectoryTree,
} from "../src/trpc/router/workspace-cleanup/remove-directory-tree";

/** Test teardown only: a read-only directory defeats `rmSync` exactly as it
 * defeats the code under test. */
function restoreOwnerAccess(root: string): void {
	chmodSync(root, 0o700);
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		if (entry.isDirectory()) restoreOwnerAccess(join(root, entry.name));
	}
}

describe("isPermissionDenied", () => {
	test("matches EACCES and nothing else", () => {
		expect(isPermissionDenied({ code: "EACCES" })).toBe(true);

		// Every one of these shares HOST-SERVICE-5J's fingerprint, and none is
		// a cleared write bit: rescuing them would silence a real failure.
		// ENOTEMPTY is a live writer re-creating files under the delete; EPERM
		// is an immutable flag or foreign ownership, which a chmod by this
		// process cannot lift either.
		expect(isPermissionDenied({ code: "ENOTEMPTY" })).toBe(false);
		expect(isPermissionDenied({ code: "EPERM" })).toBe(false);
		expect(isPermissionDenied({ code: "EBUSY" })).toBe(false);
		expect(isPermissionDenied({ code: "ENOTDIR" })).toBe(false);
		expect(isPermissionDenied(new Error("EACCES: permission denied"))).toBe(
			false,
		);
		expect(isPermissionDenied("EACCES")).toBe(false);
		expect(isPermissionDenied(null)).toBe(false);
		expect(isPermissionDenied(undefined)).toBe(false);
	});
});

describe("removeDirectoryTree", () => {
	test("removes a tree a read-only directory would otherwise pin", async () => {
		const root = mkdtempSync(join(tmpdir(), "remove-tree-"));
		const tree = join(root, "worktree");
		const output = join(tree, "evals", "results");
		mkdirSync(output, { recursive: true });
		writeFileSync(join(output, "run.json"), "{}");
		chmodSync(join(tree, "evals"), 0o555);
		try {
			await removeDirectoryTree(tree);
			expect(existsSync(tree)).toBe(false);
		} finally {
			restoreOwnerAccess(root);
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rethrows a non-permission failure untouched", async () => {
		const root = mkdtempSync(join(tmpdir(), "remove-tree-"));
		writeFileSync(join(root, "a-file"), "x");
		try {
			// A path that walks through a regular file: ENOTDIR, which `force`
			// does not swallow and the recovery pass must not swallow either.
			await expect(
				removeDirectoryTree(join(root, "a-file", "nested")),
			).rejects.toMatchObject({ code: "ENOTDIR" });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("does not follow a symlink out of the tree", async () => {
		const root = mkdtempSync(join(tmpdir(), "remove-tree-"));
		const tree = join(root, "worktree");
		const outside = join(root, "outside");
		mkdirSync(join(outside, "keep"), { recursive: true });
		writeFileSync(join(outside, "keep", "user-data.txt"), "keep me");
		chmodSync(join(outside, "keep"), 0o555);
		mkdirSync(join(tree, "pinned"), { recursive: true });
		writeFileSync(join(tree, "pinned", "f"), "x");
		symlinkSync(outside, join(tree, "link"));
		chmodSync(join(tree, "pinned"), 0o555);
		try {
			await removeDirectoryTree(tree);
			expect(existsSync(tree)).toBe(false);
			// The linked-to directory keeps both its contents and its mode: the
			// pass walked the tree, not the link.
			expect(existsSync(join(outside, "keep", "user-data.txt"))).toBe(true);
			expect(statSync(join(outside, "keep")).mode & 0o777).toBe(0o555);
		} finally {
			restoreOwnerAccess(root);
			rmSync(root, { recursive: true, force: true });
		}
	});
});
