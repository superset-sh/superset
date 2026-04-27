import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit from "simple-git";
import { resolveLocalRepo } from "./resolve-repo";

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
