import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit from "simple-git";
import { cloneRepoInto, resolveLocalRepo } from "./resolve-repo";

describe("resolveLocalRepo", () => {
	let repo: string;

	beforeEach(async () => {
		repo = mkdtempSync(join(tmpdir(), "superset-local-repo-"));
		await simpleGit(repo).init();
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("accepts a git repo without GitHub remotes", async () => {
		const resolved = await resolveLocalRepo(repo);

		expect(resolved.repoPath).toBe(realpathSync.native(repo));
		expect(resolved.remoteName).toBeNull();
		expect(resolved.parsed).toBeNull();
	});

	test("returns origin when a GitHub origin exists", async () => {
		const git = simpleGit(repo);
		await git.addRemote("origin", "git@github.com:acme/example.git");

		const resolved = await resolveLocalRepo(repo);

		expect(resolved.remoteName).toBe("origin");
		expect(resolved.parsed?.url).toBe("https://github.com/acme/example");
	});
});

describe("cloneRepoInto", () => {
	let workRoot: string;

	beforeEach(() => {
		workRoot = mkdtempSync(join(tmpdir(), "superset-clone-repo-"));
	});

	afterEach(() => {
		rmSync(workRoot, { recursive: true, force: true });
	});

	test("clones a local-path repo and resolves it as local-only", async () => {
		const source = join(workRoot, "source-repo");
		const parentDir = join(workRoot, "clones");
		mkdirSync(source);
		await simpleGit(source).init();
		// commit something so `git clone` has refs to copy
		await simpleGit(source).raw(["commit", "--allow-empty", "-m", "seed"]);
		mkdirSync(parentDir);

		const resolved = await cloneRepoInto(source, parentDir);

		expect(realpathSync(resolved.repoPath)).toBe(
			realpathSync(join(parentDir, "source-repo")),
		);
		expect(resolved.remoteName).toBeNull();
		expect(resolved.parsed).toBeNull();
	});
});
