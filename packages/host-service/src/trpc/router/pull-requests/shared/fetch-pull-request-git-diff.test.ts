import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import * as toolEnvironment from "../../../../terminal/clean-shell-env";
import { diffRemoteCommits } from "./fetch-pull-request-git-diff";

const execFileAsync = promisify(execFile);
const directories: string[] = [];
const env = Object.fromEntries(
	Object.entries(process.env).filter(
		(entry): entry is [string, string] =>
			typeof entry[1] === "string" && !entry[0].startsWith("GIT_"),
	),
);
const gitEnv = {
	...env,
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_TERMINAL_PROMPT: "0",
};

async function fixture() {
	const directory = await fs.mkdtemp(join(tmpdir(), "superset-pr-diff-test-"));
	directories.push(directory);
	const git = async (...args: string[]) => {
		const { stdout } = await execFileAsync(
			"git",
			[
				"-c",
				"user.name=PR Diff Test",
				"-c",
				"user.email=pr-diff@example.test",
				"-c",
				"commit.gpgsign=false",
				"-c",
				`core.hooksPath=${join(directory, "hooks")}`,
				...args,
			],
			{ cwd: directory, env: gitEnv, encoding: "utf8" },
		);
		return stdout.trim();
	};
	await git("init", "--initial-branch=main", "--template=");
	const write = (name: string, content: string | Uint8Array) =>
		fs.writeFile(join(directory, name), content);
	const commit = async () => {
		await git("add", "--all");
		await git("commit", "--message=fixture");
		return git("rev-parse", "HEAD");
	};
	return {
		directory,
		git,
		write,
		commit,
		remote: pathToFileURL(directory).href,
	};
}

function trackCleanup() {
	const original = fs.rm;
	const removed: string[] = [];
	spyOn(fs, "rm").mockImplementation(async (path, options) => {
		removed.push(path.toString());
		return original(path, options);
	});
	return removed;
}

afterEach(async () => {
	mock.restore();
	await Promise.all(
		directories
			.splice(0)
			.map((directory) => fs.rm(directory, { recursive: true, force: true })),
	);
});

test("fetches a complete patch with renames, deletions, binary and unusual paths", async () => {
	const repo = await fixture();
	await repo.write("modified.txt", "before\n");
	await repo.write("deleted.txt", "deleted\n");
	await repo.write("old-name.txt", "rename unchanged\n");
	await repo.write("binary.dat", new Uint8Array([0, 1, 2, 3]));
	await repo.write("no-newline.txt", "before");
	const base = await repo.commit();
	await repo.write("modified.txt", "after\n");
	await fs.unlink(join(repo.directory, "deleted.txt"));
	await fs.rename(
		join(repo.directory, "old-name.txt"),
		join(repo.directory, "new-name.txt"),
	);
	await repo.write("binary.dat", new Uint8Array([0, 4, 5, 6]));
	await repo.write("white space.txt", "added space\n");
	await repo.write("日本語.txt", "added unicode\n");
	await repo.write("no-newline.txt", "after");
	const head = await repo.commit();
	spyOn(toolEnvironment, "getToolEnvironment").mockResolvedValue(env);
	const created = trackCleanup();
	const patch = await diffRemoteCommits(repo.remote, base, head);
	expect(patch.match(/^diff --git /gm)).toHaveLength(7);
	expect(patch).toContain("-before\n+after");
	expect(patch).toContain("deleted file mode 100644");
	expect(patch).toContain("rename from old-name.txt\nrename to new-name.txt");
	expect(patch).toContain("Binary files a/binary.dat and b/binary.dat differ");
	expect(patch).toContain("diff --git a/white space.txt b/white space.txt");
	expect(patch).toContain("diff --git a/日本語.txt b/日本語.txt");
	expect(patch).toContain("\\ No newline at end of file");
	expect(created).toHaveLength(1);
	expect(created.every((directory) => !existsSync(directory))).toBe(true);
}, 20_000);

test("diffs the pinned merge base and head without including later target changes", async () => {
	const repo = await fixture();
	await repo.write("shared.txt", "original\n");
	const mergeBase = await repo.commit();
	await repo.git("checkout", "-b", "pull-request");
	await repo.write("pr-only.txt", "PR change\n");
	const head = await repo.commit();
	await repo.git("checkout", "main");
	await repo.write("target-only.txt", "unrelated target change\n");
	await repo.commit();
	spyOn(toolEnvironment, "getToolEnvironment").mockResolvedValue({
		...env,
		GIT_DIR: "/missing/git-dir",
		GIT_WORK_TREE: "/missing/work-tree",
	});
	const patch = await diffRemoteCommits(repo.remote, mergeBase, head);
	expect(patch).toContain("+PR change");
	expect(patch).not.toContain("target-only");
	expect(await repo.git("status", "--porcelain")).toBe("");
	expect(await repo.git("branch", "--show-current")).toBe("main");
}, 20_000);

test("returns an empty patch for identical pinned revisions", async () => {
	const repo = await fixture();
	await repo.write("unchanged.txt", "same\n");
	const sha = await repo.commit();
	spyOn(toolEnvironment, "getToolEnvironment").mockResolvedValue(env);
	expect(await diffRemoteCommits(repo.remote, sha, sha)).toBe("");
}, 20_000);

test("removes the temporary repository when fetching fails", async () => {
	const repo = await fixture();
	spyOn(toolEnvironment, "getToolEnvironment").mockResolvedValue(env);
	const created = trackCleanup();
	await expect(
		diffRemoteCommits(`${repo.remote}/missing`, "a".repeat(40), "b".repeat(40)),
	).rejects.toThrow();
	expect(created).toHaveLength(1);
	expect(created.every((directory) => !existsSync(directory))).toBe(true);
}, 20_000);

test.each([
	["main", "b".repeat(40)],
	["a".repeat(40), "--upload-pack=evil"],
	["a".repeat(39), "b".repeat(40)],
])("rejects unpinned revisions before starting Git: %s %s", async (base, head) => {
	const environment = spyOn(
		toolEnvironment,
		"getToolEnvironment",
	).mockResolvedValue(env);
	await expect(
		diffRemoteCommits("file:///unused", base, head),
	).rejects.toThrow();
	expect(environment).not.toHaveBeenCalled();
});

test("validates and pins GitHub metadata in an isolated process", () => {
	const result = Bun.spawnSync({
		cmd: [
			process.execPath,
			"test",
			join(import.meta.dir, "fixtures/git-diff-metadata.checks.ts"),
		],
		cwd: process.cwd(),
		env: process.env,
	});
	expect(
		result.exitCode,
		`${result.stdout.toString()}\n${result.stderr.toString()}`,
	).toBe(0);
});
