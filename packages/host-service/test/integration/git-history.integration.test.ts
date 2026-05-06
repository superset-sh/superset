import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BasicScenario, createBasicScenario } from "../helpers/scenarios";

describe("git history + diff procedures", () => {
	let scenario: BasicScenario;

	beforeEach(async () => {
		scenario = await createBasicScenario();
	});

	afterEach(async () => {
		await scenario?.dispose();
	});

	test("listCommits returns [] when on default branch with nothing ahead", async () => {
		const result = await scenario.host.trpc.git.listCommits.query({
			workspaceId: scenario.workspaceId,
		});
		expect(result.commits).toEqual([]);
	});

	test("listCommits returns commits on a feature branch ahead of base", async () => {
		// Synthesize an `origin/main` ref pointing at the current main without
		// configuring a real remote — `resolveBaseComparison` falls back to
		// `origin/<default>` when no upstream is configured, so the ref must
		// exist for `git log origin/main..HEAD` to resolve.
		await scenario.repo.git.raw([
			"update-ref",
			"refs/remotes/origin/main",
			"refs/heads/main",
		]);
		await scenario.repo.git.raw([
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
			"refs/remotes/origin/main",
		]);

		await scenario.repo.git.checkoutLocalBranch("feature/x");
		await scenario.repo.commit("first feature commit", { "a.txt": "a" });
		await scenario.repo.commit("second feature commit", { "b.txt": "b" });

		const result = await scenario.host.trpc.git.listCommits.query({
			workspaceId: scenario.workspaceId,
		});
		expect(result.commits.length).toBeGreaterThanOrEqual(2);
		expect(result.commits[0].message).toBe("second feature commit");
		expect(
			result.commits.some((c) => c.message === "first feature commit"),
		).toBe(true);
	});

	test("getCommitFiles lists files changed in a commit", async () => {
		const sha = await scenario.repo.commit("add files", {
			"x.txt": "x content",
			"y.txt": "y content",
		});

		const result = await scenario.host.trpc.git.getCommitFiles.query({
			workspaceId: scenario.workspaceId,
			commitHash: sha,
		});
		const paths = result.files.map((f) => f.path).sort();
		expect(paths).toContain("x.txt");
		expect(paths).toContain("y.txt");
	});

	test("getDiff returns staged content for a staged change", async () => {
		const filePath = join(scenario.repo.repoPath, "README.md");
		writeFileSync(filePath, "modified line\n");
		await scenario.repo.git.add("README.md");

		const result = await scenario.host.trpc.git.getDiff.query({
			workspaceId: scenario.workspaceId,
			path: "README.md",
			category: "staged",
		});
		expect(result.newFile.name).toBe("README.md");
		expect(result.newFile.contents).toContain("modified line");
	});

	test("getBranchSyncStatus reflects no-remote / no-upstream state", async () => {
		const result = await scenario.host.trpc.git.getBranchSyncStatus.query({
			workspaceId: scenario.workspaceId,
		});
		expect(result.hasRepo).toBe(false);
		expect(result.hasUpstream).toBe(false);
		expect(result.pushCount).toBe(0);
		expect(result.pullCount).toBe(0);
		expect(result.isDetached).toBe(false);
		expect(result.currentBranch).toBe("main");
	});

	test("getBranchSyncStatus reports detached HEAD when checked out at a sha", async () => {
		const sha = await scenario.repo.commit("for-detach", { "d.txt": "d" });
		await scenario.repo.git.checkout(sha);

		const result = await scenario.host.trpc.git.getBranchSyncStatus.query({
			workspaceId: scenario.workspaceId,
		});
		expect(result.isDetached).toBe(true);
		expect(result.currentBranch).toBeNull();
	});
});
