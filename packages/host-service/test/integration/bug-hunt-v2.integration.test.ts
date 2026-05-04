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
	// Both `workspaceCreation.create` and `workspaceCreation.getProgress`
	// were removed by PR #3893 (canonical workspaces.create) — the entire
	// progress store is gone. The leak these tests guarded is no longer
	// reachable. Re-author against `workspaces.create` if/when an
	// equivalent surface exists.
	test.todo(
		"PROJECT_NOT_SETUP error in create() does not leak a stale progress entry",
	);
	test.todo(
		"whitespace-only branchName error in create() does not leak progress",
	);
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

	test("destroy rejects a main workspace BEFORE running teardown or cloud-delete", async () => {
		// We can't exercise the actual `teardown.sh` script in bun:test
		// (the harness has no PTY). What we *can* verify here is the
		// phase-0 main-workspace guard fires first, so a destructive cloud
		// delete is never attempted on a main workspace even if teardown
		// would otherwise be skipped. Real TEARDOWN_FAILED behavior would
		// need a PTY-enabled harness to cover.
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

		await expect(
			host.trpc.workspaceCleanup.destroy.mutate({ workspaceId }),
		).rejects.toThrow(/Main workspaces cannot be deleted/i);

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
