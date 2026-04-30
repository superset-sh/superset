import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("git history + diff procedures", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = randomUUID();
	const workspaceId = randomUUID();

	beforeEach(async () => {
		host = await createTestHost();
		repo = await createGitFixture();

		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath: repo.repoPath,
				branch: "main",
			})
			.run();
	});

	afterEach(async () => {
		await host.dispose();
		repo.dispose();
	});

	test("listCommits returns [] when on default branch with nothing ahead", async () => {
		const result = await host.trpc.git.listCommits.query({ workspaceId });
		expect(result.commits).toEqual([]);
	});

	test("listCommits returns commits on a feature branch ahead of base", async () => {
		// Synthesize an `origin/main` ref pointing at the current main without
		// configuring a real remote — `resolveBaseComparison` falls back to
		// `origin/<default>` when no upstream is configured, so the ref must
		// exist for `git log origin/main..HEAD` to resolve.
		await repo.git.raw([
			"update-ref",
			"refs/remotes/origin/main",
			"refs/heads/main",
		]);
		await repo.git.raw([
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
			"refs/remotes/origin/main",
		]);

		await repo.git.checkoutLocalBranch("feature/x");
		await repo.commit("first feature commit", { "a.txt": "a" });
		await repo.commit("second feature commit", { "b.txt": "b" });

		const result = await host.trpc.git.listCommits.query({ workspaceId });
		expect(result.commits.length).toBeGreaterThanOrEqual(2);
		expect(result.commits[0].message).toBe("second feature commit");
		expect(
			result.commits.some((c) => c.message === "first feature commit"),
		).toBe(true);
	});

	test("getCommitFiles lists files changed in a commit", async () => {
		const sha = await repo.commit("add files", {
			"x.txt": "x content",
			"y.txt": "y content",
		});

		const result = await host.trpc.git.getCommitFiles.query({
			workspaceId,
			commitHash: sha,
		});
		const paths = result.files.map((f) => f.path).sort();
		expect(paths).toContain("x.txt");
		expect(paths).toContain("y.txt");
	});

	test("getDiff returns staged content for a staged change", async () => {
		const filePath = join(repo.repoPath, "README.md");
		writeFileSync(filePath, "modified line\n");
		await repo.git.add("README.md");

		const result = await host.trpc.git.getDiff.query({
			workspaceId,
			path: "README.md",
			category: "staged",
		});
		expect(result.newFile.name).toBe("README.md");
		expect(result.newFile.contents).toContain("modified line");
	});

	test("getBranchSyncStatus reflects no-remote / no-upstream state", async () => {
		const result = await host.trpc.git.getBranchSyncStatus.query({
			workspaceId,
		});
		expect(result.hasRepo).toBe(false);
		expect(result.hasUpstream).toBe(false);
		expect(result.pushCount).toBe(0);
		expect(result.pullCount).toBe(0);
		expect(result.isDetached).toBe(false);
		expect(result.currentBranch).toBe("main");
	});

	test("getBranchSyncStatus reports detached HEAD when checked out at a sha", async () => {
		const sha = await repo.commit("for-detach", { "d.txt": "d" });
		await repo.git.checkout(sha);

		const result = await host.trpc.git.getBranchSyncStatus.query({
			workspaceId,
		});
		expect(result.isDetached).toBe(true);
		expect(result.currentBranch).toBeNull();
	});
});
