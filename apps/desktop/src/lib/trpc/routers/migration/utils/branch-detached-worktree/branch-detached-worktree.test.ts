import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { branchDetachedWorktree } from "./branch-detached-worktree";

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function git(...args: string[]) {
	return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function detachedRepoWithEdit() {
	dir = mkdtempSync(join(tmpdir(), "branch-detached-"));
	git("init", "-q", "-b", "feat");
	git(
		"-c",
		"user.name=t",
		"-c",
		"user.email=t@t",
		"commit",
		"-q",
		"--allow-empty",
		"-m",
		"init",
	);
	git("checkout", "-q", "--detach");
	writeFileSync(join(dir, "notes.txt"), "uncommitted");
}

describe("branchDetachedWorktree", () => {
	test("puts a detached worktree on a new free branch and keeps its files", async () => {
		detachedRepoWithEdit();
		const result = await branchDetachedWorktree(simpleGit(dir), "feat");
		expect(result).toEqual({ branch: "feat-2", created: true });
		expect(git("rev-parse", "--abbrev-ref", "HEAD")).toBe("feat-2");
		expect(readFileSync(join(dir, "notes.txt"), "utf8")).toBe("uncommitted");
	});

	test("leaves a worktree that is already on a branch alone", async () => {
		detachedRepoWithEdit();
		git("checkout", "-q", "feat");
		const result = await branchDetachedWorktree(simpleGit(dir), "other");
		expect(result).toEqual({ branch: "feat", created: false });
	});
});
