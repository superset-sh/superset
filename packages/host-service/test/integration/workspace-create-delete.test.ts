import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { eq } from "drizzle-orm";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("workspace.create + workspace.delete integration", () => {
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

	test("create() adds a worktree, calls cloud, and persists workspace row", async () => {
		// `workspace.create` calls `ensureMainWorkspace` first, which itself
		// hits `v2Workspace.create.mutate`. Return a fresh id per call so the
		// main + feature rows don't collide on the workspaces.id PK.
		const ids: string[] = [];
		host = await createTestHost({
			apiOverrides: {
				"host.ensure.mutate": () => ({ machineId: "machine-1" }),
				"v2Workspace.create.mutate": (input: unknown) => {
					const id = randomUUID();
					ids.push(id);
					const i = input as { branch: string; name: string };
					return {
						id,
						projectId,
						branch: i.branch,
						name: i.name,
					};
				},
			},
		});
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();

		const result = await host.trpc.workspace.create.mutate({
			projectId,
			name: "new ws",
			branch: "feature/new",
		});

		expect(result?.branch).toBe("feature/new");
		expect(ids).toContain(result?.id);

		const expectedWorktree = join(repo.repoPath, ".worktrees", "feature/new");
		expect(existsSync(expectedWorktree)).toBe(true);

		const persisted = host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result?.id ?? ""))
			.get();
		expect(persisted?.branch).toBe("feature/new");
		expect(persisted?.worktreePath).toBe(expectedWorktree);
	});

	test("create() rolls back the worktree if cloud v2Workspace.create fails", async () => {
		host = await createTestHost({
			apiOverrides: {
				"host.ensure.mutate": () => ({ machineId: "machine-1" }),
				"v2Workspace.create.mutate": () => {
					throw new Error("cloud-down");
				},
			},
		});
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();

		await expect(
			host.trpc.workspace.create.mutate({
				projectId,
				name: "ws",
				branch: "feature/rollback",
			}),
		).rejects.toThrow(/cloud-down/);

		const expectedWorktree = join(
			repo.repoPath,
			".worktrees",
			"feature/rollback",
		);
		expect(existsSync(expectedWorktree)).toBe(false);

		const rows = host.db.select().from(workspaces).all();
		expect(rows).toHaveLength(0);
	});

	test("delete() rejects deleting a main workspace by path equality", async () => {
		host = await createTestHost();
		const workspaceId = randomUUID();
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
			host.trpc.workspace.delete.mutate({ id: workspaceId }),
		).rejects.toThrow(/Main workspaces cannot be deleted/i);
	});

	test("delete() removes the worktree and the local row on success", async () => {
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

		const worktreePath = join(repo.repoPath, ".worktrees", "feature/del");
		await repo.git.raw(["worktree", "add", "-b", "feature/del", worktreePath]);
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath,
				branch: "feature/del",
			})
			.run();

		const result = await host.trpc.workspace.delete.mutate({ id: workspaceId });
		expect(result).toEqual({ success: true });

		expect(existsSync(worktreePath)).toBe(false);
		const rows = host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.all();
		expect(rows).toHaveLength(0);
		expect(
			host.apiCalls.some((c) => c.path === "v2Workspace.delete.mutate"),
		).toBe(true);
	});

	test("delete() requires authentication", async () => {
		host = await createTestHost();
		await expect(
			host.unauthenticatedTrpc.workspace.delete.mutate({ id: randomUUID() }),
		).rejects.toBeInstanceOf(TRPCClientError);
	});
});
