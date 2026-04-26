import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit from "simple-git";
import {
	cloneRepoInto,
	resolveLocalGitRepo,
	resolveWithPrimaryRemote,
} from "./resolve-repo";

const tempRoots: string[] = [];

function makeTempRoot(): string {
	const path = mkdtempSync(join(tmpdir(), "superset-resolve-repo-"));
	tempRoots.push(path);
	return path;
}

async function initRepo(path: string) {
	mkdirSync(path, { recursive: true });
	const git = simpleGit(path);
	await git.init();
	return git;
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("resolveLocalGitRepo", () => {
	test("accepts a local-only git repo without GitHub remotes", async () => {
		const root = makeTempRoot();
		const repo = join(root, "local-only");
		await initRepo(repo);

		const resolved = await resolveLocalGitRepo(repo);

		expect(realpathSync(resolved.repoPath)).toBe(realpathSync(repo));
		expect(resolved.remoteName).toBeNull();
		expect(resolved.parsed).toBeNull();
	});

	test("prefers origin when multiple GitHub remotes exist", async () => {
		const root = makeTempRoot();
		const repo = join(root, "with-remotes");
		const git = await initRepo(repo);
		await git.addRemote("upstream", "https://github.com/Other/Repo.git");
		await git.addRemote("origin", "git@github.com:Acme/App.git");

		const resolved = await resolveLocalGitRepo(repo);

		expect(resolved.remoteName).toBe("origin");
		expect(resolved.parsed).toEqual({
			provider: "github",
			owner: "Acme",
			name: "App",
			url: "https://github.com/Acme/App",
		});
	});
});

describe("resolveWithPrimaryRemote", () => {
	test("still rejects repos without GitHub remotes for strict callers", async () => {
		const root = makeTempRoot();
		const repo = join(root, "local-only");
		await initRepo(repo);

		await expect(resolveWithPrimaryRemote(repo)).rejects.toThrow(
			/Repository has no GitHub remotes/,
		);
	});
});

describe("cloneRepoInto", () => {
	test("clones a local repo and resolves it as local-only when no GitHub remote exists", async () => {
		const root = makeTempRoot();
		const source = join(root, "source-repo");
		const parentDir = join(root, "clones");
		await initRepo(source);
		mkdirSync(parentDir);

		const resolved = await cloneRepoInto(source, parentDir);

		expect(realpathSync(resolved.repoPath)).toBe(
			realpathSync(join(parentDir, "source-repo")),
		);
		expect(resolved.remoteName).toBeNull();
		expect(resolved.parsed).toBeNull();
	});
});
