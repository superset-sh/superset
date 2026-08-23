import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createProjectScenario } from "../helpers/scenarios";

/**
 * `workspaces.create({ noWorktree: true })` — the workspace is the project
 * folder itself. These tests assert against the real repo on disk: which
 * branch it ends up on, and that no worktree was added for it.
 */
describe("workspaces.create with noWorktree", () => {
	let dispose: (() => Promise<void>) | undefined;

	afterEach(async () => {
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
	});

	test("returns the project's main workspace and leaves the branch alone", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			noWorktree: true,
		});

		expect(result.workspace.branch).toBe("main");
		expect(result.alreadyExists).toBe(true);

		const persisted = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		expect(persisted?.type).toBe("main");
		expect(persisted?.worktreePath).toBe(scenario.repo.repoPath);

		// One worktree in the list means the repo itself and nothing else.
		const worktrees = await scenario.repo.git.raw([
			"worktree",
			"list",
			"--porcelain",
		]);
		expect(worktrees.match(/^worktree /gm)?.length).toBe(1);
	});

	test("a second create with noWorktree returns the same workspace", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const first = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			noWorktree: true,
		});
		const second = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			noWorktree: true,
		});

		expect(second.workspace.id).toBe(first.workspace.id);
	});

	test("a branch is created in the project folder, not in a worktree", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			branch: "in-place",
			skipBranchPrefix: true,
			noWorktree: true,
		});

		expect(result.workspace.branch).toBe("in-place");

		const head = await scenario.repo.git.raw([
			"symbolic-ref",
			"--short",
			"HEAD",
		]);
		expect(head.trim()).toBe("in-place");
		expect(existsSync(join(scenario.repo.repoPath, ".worktrees"))).toBe(false);

		// The row follows the checkout, so the sidebar and every terminal
		// opened later report the branch the folder is really on.
		const persisted = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.workspace.id))
			.get();
		expect(persisted?.branch).toBe("in-place");
	});

	test("an existing branch is checked out rather than re-created", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		await scenario.repo.git.raw(["branch", "already-here"]);

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			branch: "already-here",
			noWorktree: true,
		});

		expect(result.workspace.branch).toBe("already-here");
		const head = await scenario.repo.git.raw([
			"symbolic-ref",
			"--short",
			"HEAD",
		]);
		expect(head.trim()).toBe("already-here");
	});

	test("refuses to switch a folder that has uncommitted changes", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		writeFileSync(
			join(scenario.repo.repoPath, "README.md"),
			"edited but not committed",
		);

		await expect(
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				branch: "in-place",
				skipBranchPrefix: true,
				noWorktree: true,
			}),
		).rejects.toThrow(/uncommitted changes/i);

		const head = await scenario.repo.git.raw([
			"symbolic-ref",
			"--short",
			"HEAD",
		]);
		expect(head.trim()).toBe("main");
	});

	test("refuses a branch another worktree already has checked out", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const elsewhere = join(scenario.repo.repoPath, ".worktrees", "taken");
		await scenario.repo.git.raw(["worktree", "add", "-b", "taken", elsewhere]);

		await expect(
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				branch: "taken",
				noWorktree: true,
			}),
		).rejects.toThrow(/already checked out/i);
	});

	test("rejects noWorktree together with pr", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		await expect(
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				pr: 1,
				noWorktree: true,
			}),
		).rejects.toThrow();
	});
});
