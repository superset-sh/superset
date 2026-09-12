import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import * as configWrite from "../../src/trpc/router/git/utils/config-write";
import { cloudFlows } from "../helpers/cloud-fakes";
import {
	createBasicScenario,
	createFeatureWorktreeScenario,
	createProjectScenario,
} from "../helpers/scenarios";
import { seedWorkspace } from "../helpers/seed";

describe("workspaceCreation.adopt integration", () => {
	let dispose: (() => Promise<void>) | undefined;

	afterEach(async () => {
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
	});

	test("rejects with PROJECT_NOT_SETUP when project isn't in db", async () => {
		const scenario = await createBasicScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		// Assert the specific PROJECT_NOT_SETUP cause structure (set by
		// `requireLocalProject`'s `projectNotSetupError`) rather than just
		// "any throw" — that way an unrelated regression that happens to
		// throw doesn't pass this test.
		await expect(
			scenario.host.trpc.workspaceCreation.adopt.mutate({
				projectId: randomUUID(),
				workspaceName: "x",
				branch: "feature/x",
			}),
		).rejects.toMatchObject({
			data: { code: "PRECONDITION_FAILED" },
		});
	});

	test("rejects when no managed worktree exists for the branch", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		await expect(
			scenario.host.trpc.workspaceCreation.adopt.mutate({
				projectId: scenario.projectId,
				workspaceName: "x",
				branch: "feature/missing",
			}),
		).rejects.toThrow(/No existing worktree/);
	});

	test("rejects with NOT_FOUND when explicit worktreePath isn't a registered worktree", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		await expect(
			scenario.host.trpc.workspaceCreation.adopt.mutate({
				projectId: scenario.projectId,
				workspaceName: "x",
				branch: "feature/x",
				worktreePath: "/tmp/not-a-real-worktree",
			}),
		).rejects.toThrow(/No git worktree registered/);
	});

	test("adopts a worktree at an explicit path, creates cloud row + local row", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const worktreePath = join(
			scenario.repo.repoPath,
			".worktrees",
			"feature-adopt",
		);
		await scenario.repo.git.raw([
			"worktree",
			"add",
			"-b",
			"feature/adopt",
			worktreePath,
		]);

		const result = await scenario.host.trpc.workspaceCreation.adopt.mutate({
			projectId: scenario.projectId,
			workspaceName: "adopted",
			branch: "feature/adopt",
			worktreePath,
		});

		expect(result.workspace.branch).toBe("feature/adopt");
		expect(result.warnings).toEqual([]);

		const persisted = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		expect(persisted?.worktreePath).toBe(worktreePath);
		expect(persisted?.branch).toBe("feature/adopt");
	});

	test("relinking a known workspace id restores it if it was shelved", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const worktreePath = join(
			scenario.repo.repoPath,
			".worktrees",
			"feature-relink",
		);
		await scenario.repo.git.raw([
			"worktree",
			"add",
			"-b",
			"feature/relink",
			worktreePath,
		]);
		const { id: workspaceId } = seedWorkspace(scenario.host, {
			projectId: scenario.projectId,
			worktreePath,
			branch: "feature/relink",
		});
		scenario.host.db
			.update(workspaces)
			.set({ shelvedAt: Date.now() })
			.where(eq(workspaces.id, workspaceId))
			.run();

		const result = await scenario.host.trpc.workspaceCreation.adopt.mutate({
			projectId: scenario.projectId,
			workspaceName: "relinked",
			branch: "feature/relink",
			worktreePath,
			existingWorkspaceId: workspaceId,
		});

		expect(result.workspace.id).toBe(workspaceId);
		const persisted = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();
		expect(persisted?.shelvedAt).toBeNull();
	});

	test.each([
		"branch",
		"path",
	])("rejects %s reuse when deletion claims the workspace during base-branch recording", async (matchBy) => {
		const scenario = await createFeatureWorktreeScenario();
		dispose = scenario.dispose;
		const shelvedAt = Date.now();
		scenario.host.db
			.update(workspaces)
			.set({
				shelvedAt,
				branch: matchBy === "path" ? "feature/old-name" : scenario.branch,
			})
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.run();

		const write = configWrite.gitConfigWrite;
		const recording = spyOn(configWrite, "gitConfigWrite").mockImplementation(
			async (...args) => {
				const result = await write(...args);
				scenario.host.db
					.update(workspaces)
					.set({ archivedAt: Date.now() })
					.where(eq(workspaces.id, scenario.featureWorkspaceId))
					.run();
				return result;
			},
		);
		try {
			await expect(
				scenario.host.trpc.workspaceCreation.adopt.mutate({
					projectId: scenario.projectId,
					workspaceName: "adopted",
					branch: scenario.branch,
					worktreePath: scenario.worktreePath,
					baseBranch: "main",
				}),
			).rejects.toMatchObject({ data: { code: "CONFLICT" } });
			const persisted = scenario.host.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, scenario.featureWorkspaceId))
				.get();
			expect(persisted?.archivedAt).toEqual(expect.any(Number));
			expect(persisted?.shelvedAt).toBe(shelvedAt);
		} finally {
			recording.mockRestore();
		}
	});

	test("recordBaseBranch persists `branch.<name>.base` in git config", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const worktreePath = join(
			scenario.repo.repoPath,
			".worktrees",
			"feature-base",
		);
		await scenario.repo.git.raw([
			"worktree",
			"add",
			"-b",
			"feature/base",
			worktreePath,
		]);

		await scenario.host.trpc.workspaceCreation.adopt.mutate({
			projectId: scenario.projectId,
			workspaceName: "base-test",
			branch: "feature/base",
			baseBranch: "main",
			worktreePath,
		});

		const configured = (
			await scenario.repo.git.raw(["config", "branch.feature/base.base"])
		).trim();
		expect(configured).toBe("main");
	});
});
