import { expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { resolveNewBranchStartPoint } from "../../src/trpc/router/workspace-creation/utils/resolve-new-branch-start-point";
import { resolveStartPoint } from "../../src/trpc/router/workspace-creation/utils/resolve-start-point";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

interface CloneFixture {
	origin: GitFixture;
	clonePath: string;
	git: SimpleGit;
	dispose: () => void;
}

async function createStaleClone(): Promise<CloneFixture> {
	const origin = await createGitFixture();
	const clonePath = realpathSync(
		mkdtempSync(join(tmpdir(), "host-service-test-clone-")),
	);
	await simpleGit().clone(origin.repoPath, clonePath);
	const git = simpleGit(clonePath);
	await origin.commit("origin advances 1");
	await origin.commit("origin advances 2");
	const dispose = (): void => {
		origin.dispose();
		rmSync(clonePath, { recursive: true, force: true });
	};
	return { origin, clonePath, git, dispose };
}

test("explicit remote-qualified base (origin/main) fails instead of falling back to stale HEAD", async () => {
	const s = await createStaleClone();
	try {
		await expect(resolveStartPoint(s.git, "origin/main")).rejects.toThrow(
			"origin/main",
		);
	} finally {
		s.dispose();
	}
});

test("explicit unknown base (typo) fails instead of falling back to stale HEAD", async () => {
	const s = await createStaleClone();
	try {
		await expect(resolveStartPoint(s.git, "mian")).rejects.toThrow("mian");
	} finally {
		s.dispose();
	}
});

test("a failed fetch of a resolved remote-tracking base aborts instead of forking from the stale ref", async () => {
	const s = await createStaleClone();
	try {
		await s.git.remote(["set-url", "origin", join(s.clonePath, "gone")]);
		await expect(resolveNewBranchStartPoint(s.git, "main")).rejects.toThrow();
	} finally {
		s.dispose();
	}
});

test("valid no-base resolution still fetches and lands on the remote-tracking ref", async () => {
	const s = await createStaleClone();
	try {
		const result = await resolveNewBranchStartPoint(s.git, undefined);
		expect(result.kind).toBe("remote-tracking");
		if (result.kind === "remote-tracking") {
			expect(result.remoteShortName).toBe("origin/main");
		}
		const tip = (await s.origin.git.revparse(["main"])).trim();
		const tracking = (
			await s.git.revparse(["refs/remotes/origin/main"])
		).trim();
		expect(tracking).toBe(tip);
	} finally {
		s.dispose();
	}
});
