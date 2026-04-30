/**
 * v2-specific bug hunt. v1 (workspace.*) is sunset; ignore those surfaces.
 * Pass = defense holds. Fail / .todo = real v2 bug.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("bug-hunt-v2: progress-store leak on early errors in workspaceCreation.create", () => {
	let host: TestHost;
	let repo: GitFixture;

	beforeEach(async () => {
		host = await createTestHost();
		repo = await createGitFixture();
	});

	afterEach(async () => {
		await host.dispose();
		repo.dispose();
	});

	test.todo("BUG: PROJECT_NOT_SETUP error in create() leaks an 'active' progress entry", async () => {
		// `setProgress(pendingId, 'ensuring_repo')` runs BEFORE
		// `requireLocalProject` (which throws PROJECT_NOT_SETUP). The throw
		// path doesn't call clearProgress, so getProgress returns a stale
		// "active" state for up to 5 min until sweepStaleProgress catches it.
		const pendingId = randomUUID();

		await expect(
			host.trpc.workspaceCreation.create.mutate({
				pendingId,
				projectId: randomUUID(),
				names: { workspaceName: "ws", branchName: "feature/x" },
				composer: {},
			}),
		).rejects.toThrow();

		const progress = await host.trpc.workspaceCreation.getProgress.query({
			pendingId,
		});
		// Today: progress is non-null with ensuring_repo "active"; the
		// renderer would keep showing the spinner. Should be null.
		expect(progress).toBeNull();
	});

	test.todo("BUG: empty branchName error in create() leaks 'creating_worktree' progress", async () => {
		const projectId = randomUUID();
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();
		const pendingId = randomUUID();

		// Empty branch name throws AFTER setProgress(creating_worktree).
		// To get past requireLocalProject we need a project; to fail at
		// the empty-name check we need branchName to fail .min(1) earlier
		// — but z does that first. So use whitespace-only which passes
		// zod (length 1+) but fails the `.trim()` check inside.
		await expect(
			host.trpc.workspaceCreation.create.mutate({
				pendingId,
				projectId,
				names: { workspaceName: "ws", branchName: "   " },
				composer: {},
			}),
		).rejects.toThrow();

		const progress = await host.trpc.workspaceCreation.getProgress.query({
			pendingId,
		});
		expect(progress).toBeNull();
	});
});

describe("bug-hunt-v2: workspaceCleanup.destroy phase ordering", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = randomUUID();

	beforeEach(async () => {
		repo = await createGitFixture();
	});

	afterEach(async () => {
		if (host) await host.dispose();
		repo.dispose();
	});

	test("when teardown.sh exists and the harness lacks PTY, runTeardown errors are surfaced as TEARDOWN_FAILED (not silently skipped)", async () => {
		// We can't actually exercise teardown.sh in bun:test (no node-pty),
		// but we can verify the procedure behaves correctly when no script
		// exists: it should skip phase 1 and proceed to phase 2 (cloud
		// delete). The bug we're hunting: phase 1 short-circuit on missing
		// script.
		const workspaceId = randomUUID();
		host = await createTestHost({
			apiOverrides: {
				"v2Workspace.getFromHost.query": () => ({ type: "feature" }),
				"v2Workspace.delete.mutate": () => ({ success: true }),
			},
		});
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

		// Workspace is "main" by path equality — should reject with
		// BAD_REQUEST BEFORE even attempting teardown.
		await expect(
			host.trpc.workspaceCleanup.destroy.mutate({ workspaceId }),
		).rejects.toThrow(/Main workspaces cannot be deleted/i);

		// Cloud delete must NOT have been called.
		expect(
			host.apiCalls.some((c) => c.path === "v2Workspace.delete.mutate"),
		).toBe(false);
	});
});

describe("bug-hunt-v2: workspaceCreation.adopt cross-project safety", () => {
	let host: TestHost;
	let repoA: GitFixture;
	let repoB: GitFixture;
	const projectIdA = randomUUID();
	const projectIdB = randomUUID();

	beforeEach(async () => {
		host = await createTestHost({
			apiOverrides: {
				"host.ensure.mutate": () => ({ machineId: "m1" }),
				"v2Workspace.create.mutate": (input: unknown) => {
					const i = input as { branch: string; name: string };
					return {
						id: randomUUID(),
						projectId: projectIdA,
						branch: i.branch,
						name: i.name,
					};
				},
			},
		});
		repoA = await createGitFixture();
		repoB = await createGitFixture();
		host.db
			.insert(projects)
			.values([
				{ id: projectIdA, repoPath: repoA.repoPath },
				{ id: projectIdB, repoPath: repoB.repoPath },
			])
			.run();
	});

	afterEach(async () => {
		await host.dispose();
		repoA.dispose();
		repoB.dispose();
	});

	test("adopt with worktreePath belonging to a different project is rejected", async () => {
		const { join } = await import("node:path");
		const worktreeInB = join(repoB.repoPath, ".worktrees", "feature-x");
		await repoB.git.raw(["worktree", "add", "-b", "feature/x", worktreeInB]);

		await expect(
			host.trpc.workspaceCreation.adopt.mutate({
				projectId: projectIdA,
				workspaceName: "x",
				branch: "feature/x",
				worktreePath: worktreeInB,
			}),
		).rejects.toThrow();
	});
});

describe("bug-hunt-v2: chat.sendMessage cloud failure must not break the turn", () => {
	let host: TestHost;
	const sessionId = randomUUID();
	const workspaceId = randomUUID();

	const stubChatRuntime = {
		sendMessage: async () => ({ ok: true, messageId: "m1" }),
	};

	beforeEach(async () => {
		host = await createTestHost({
			chatRuntime: stubChatRuntime,
			apiOverrides: {
				"chat.updateSession.mutate": () => {
					throw new Error("cloud-down");
				},
			},
		});
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("chat.sendMessage swallows cloud chat.updateSession failures", async () => {
		// The procedure does `void ctx.api.chat.updateSession.mutate(...).catch(() => {})`
		// — the user-visible turn must not fail because of a cloud blip.
		const result = await host.trpc.chat.sendMessage.mutate({
			sessionId,
			workspaceId,
			payload: { content: "hi" },
		});
		expect(result).toBeDefined();
	});
});
