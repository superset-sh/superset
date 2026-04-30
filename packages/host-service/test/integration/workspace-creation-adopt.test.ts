import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("workspaceCreation.adopt integration", () => {
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

	const setupHost = (
		overrides: Record<string, (input: unknown) => unknown> = {},
	) =>
		createTestHost({
			apiOverrides: {
				"host.ensure.mutate": () => ({ machineId: "machine-1" }),
				"v2Workspace.create.mutate": (input: unknown) => {
					const i = input as { branch: string; name: string };
					return {
						id: randomUUID(),
						projectId,
						branch: i.branch,
						name: i.name,
					};
				},
				...overrides,
			},
		});

	test("rejects with PROJECT_NOT_SETUP when project isn't in db", async () => {
		host = await setupHost();

		await expect(
			host.trpc.workspaceCreation.adopt.mutate({
				projectId,
				workspaceName: "x",
				branch: "feature/x",
			}),
		).rejects.toThrow();
	});

	test("rejects when no managed worktree exists for the branch", async () => {
		host = await setupHost();
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();

		// `adopt` searches `~/.superset/worktrees/<projectId>/...`; without an
		// explicit `worktreePath`, an unmanaged worktree under our test repo
		// is invisible.
		await expect(
			host.trpc.workspaceCreation.adopt.mutate({
				projectId,
				workspaceName: "x",
				branch: "feature/missing",
			}),
		).rejects.toThrow(/No existing worktree/);
	});

	test("rejects with NOT_FOUND when explicit worktreePath isn't a registered worktree", async () => {
		host = await setupHost();
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();

		await expect(
			host.trpc.workspaceCreation.adopt.mutate({
				projectId,
				workspaceName: "x",
				branch: "feature/x",
				worktreePath: "/tmp/not-a-real-worktree",
			}),
		).rejects.toThrow(/No git worktree registered/);
	});

	test("adopts a worktree at an explicit path, creates cloud row + local row", async () => {
		host = await setupHost();
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();

		const worktreePath = join(repo.repoPath, ".worktrees", "feature-adopt");
		await repo.git.raw([
			"worktree",
			"add",
			"-b",
			"feature/adopt",
			worktreePath,
		]);

		const result = await host.trpc.workspaceCreation.adopt.mutate({
			projectId,
			workspaceName: "adopted",
			branch: "feature/adopt",
			worktreePath,
		});

		expect(result.workspace.branch).toBe("feature/adopt");
		expect(result.warnings).toEqual([]);

		const persisted = host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		expect(persisted?.worktreePath).toBe(worktreePath);
		expect(persisted?.branch).toBe("feature/adopt");
	});

	test("recordBaseBranch persists `branch.<name>.base` in git config", async () => {
		host = await setupHost();
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();

		const worktreePath = join(repo.repoPath, ".worktrees", "feature-base");
		await repo.git.raw(["worktree", "add", "-b", "feature/base", worktreePath]);

		await host.trpc.workspaceCreation.adopt.mutate({
			projectId,
			workspaceName: "base-test",
			branch: "feature/base",
			baseBranch: "main",
			worktreePath,
		});

		const configured = (
			await repo.git.raw(["config", "branch.feature/base.base"])
		).trim();
		expect(configured).toBe("main");
	});
});
