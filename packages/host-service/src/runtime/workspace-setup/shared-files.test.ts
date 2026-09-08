import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { linkSharedFile, validateSharedPath } from "./shared-files";

let root: string, repo: string, workspace: string;
beforeEach(async () => {
	root = mkdtempSync(join(tmpdir(), "setup-links-"));
	repo = join(root, "repo");
	workspace = join(root, "workspace");
	mkdirSync(repo);
	mkdirSync(workspace);
	await simpleGit(repo).init();
	writeFileSync(join(repo, ".gitignore"), ".env\nconfig/\nnode_modules/\n");
	writeFileSync(join(repo, ".env"), "fixture");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
test("links share edits and retries are idempotent", async () => {
	const git = simpleGit(repo);
	await linkSharedFile(git, repo, workspace, ".env");
	await linkSharedFile(git, repo, workspace, ".env");
	expect(lstatSync(join(workspace, ".env")).isSymbolicLink()).toBe(true);
	writeFileSync(join(workspace, ".env"), "updated");
	expect(readFileSync(join(repo, ".env"), "utf8")).toBe("updated");
});
test("never overwrites destination files", async () => {
	writeFileSync(join(workspace, ".env"), "keep");
	await expect(
		linkSharedFile(simpleGit(repo), repo, workspace, ".env"),
	).rejects.toThrow("already exists");
	expect(readFileSync(join(workspace, ".env"), "utf8")).toBe("keep");
});
test("rejects tracked files, traversal, dependency directories, and destination symlink escapes", async () => {
	for (const path of [
		"../.env",
		"/tmp/.env",
		".git/config",
		"node_modules/file",
		"a/../.env",
		"a\\b",
	])
		expect(() => validateSharedPath(path)).toThrow();
	await simpleGit(repo).add(["-f", ".env"]);
	await expect(
		linkSharedFile(simpleGit(repo), repo, workspace, ".env"),
	).rejects.toThrow("ignored, untracked");
	mkdirSync(join(repo, "config"));
	writeFileSync(join(repo, "config", "file"), "fixture");
	symlinkSync(root, join(workspace, "config"));
	await expect(
		linkSharedFile(simpleGit(repo), repo, workspace, "config/file"),
	).rejects.toThrow("not a directory");
});
test("missing source fails without creating a broken link", async () => {
	await expect(
		linkSharedFile(simpleGit(repo), repo, workspace, "config/missing"),
	).rejects.toThrow();
});
