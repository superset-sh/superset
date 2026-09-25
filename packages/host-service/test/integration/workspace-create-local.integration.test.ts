import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workspaces } from "../../src/db/schema";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createProjectScenario } from "../helpers/scenarios";

describe("workspaces.create with checkout: local", () => {
	let dispose: (() => Promise<void>) | null = null;

	afterEach(async () => {
		await dispose?.();
		dispose = null;
	});

	test("two local workspaces share the checkout under different identities", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const first = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "auth refactor",
		});
		const second = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "docs pass",
		});

		expect(first.workspace.id).not.toBe(second.workspace.id);
		expect(first.workspace.type).toBe("local");
		expect(second.workspace.type).toBe("local");
		expect(first.workspace.name).toBe("auth refactor");
		expect(second.workspace.name).toBe("docs pass");
		expect(first.workspace.branch).toBe("main");
		expect(second.workspace.branch).toBe("main");
		expect(first.alreadyExists).toBe(false);
		expect(second.alreadyExists).toBe(false);

		const rows = scenario.host.db.select().from(workspaces).all();
		expect(rows.map((row) => row.worktreePath)).toEqual([
			scenario.repo.repoPath,
			scenario.repo.repoPath,
		]);
		// No worktree was added for either of them.
		expect(existsSync(join(scenario.repo.repoPath, ".worktrees"))).toBe(false);
		const worktreeList = await scenario.repo.git.raw(["worktree", "list"]);
		expect(worktreeList.trim().split("\n")).toHaveLength(1);
	});

	test("an unnamed local workspace is titled 'local', then 'local 2'", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const first = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
		});
		const second = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
		});
		expect(first.workspace.name).toBe("local");
		expect(second.workspace.name).toBe("local 2");
	});

	test("a branch switch in the checkout shows in every local workspace after the next sync", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const first = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "a",
		});
		await scenario.repo.git.checkoutLocalBranch("release");
		const second = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "b",
		});
		expect(second.workspace.branch).toBe("release");
		const firstRow = scenario.host.db
			.select()
			.from(workspaces)
			.all()
			.find((row) => row.id === first.workspace.id);
		// The PR refs sweep is what moves existing rows; creation only reads
		// the checkout for the new row.
		expect(firstRow?.branch).toBe("main");
	});

	test("deleting a local workspace leaves the checkout and its sibling intact", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const first = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "a",
		});
		const second = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
			name: "b",
		});
		writeFileSync(join(scenario.repo.repoPath, "wip.txt"), "uncommitted");

		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: first.workspace.id,
			deleteBranch: true,
		});
		expect(result.success).toBe(true);
		expect(result.worktreeRemoved).toBe(false);
		expect(result.branchDeleted).toBe(false);
		expect(existsSync(join(scenario.repo.repoPath, "wip.txt"))).toBe(true);
		expect(existsSync(join(scenario.repo.repoPath, ".git"))).toBe(true);

		const live = scenario.host.db
			.select()
			.from(workspaces)
			.all()
			.filter((row) => row.archivedAt == null);
		expect(live.map((row) => row.id)).toEqual([second.workspace.id]);

		// The last one goes too; nothing recreates it.
		await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: second.workspace.id,
		});
		expect(
			scenario.host.db
				.select()
				.from(workspaces)
				.all()
				.filter((row) => row.archivedAt == null),
		).toHaveLength(0);
		expect(existsSync(join(scenario.repo.repoPath, ".git"))).toBe(true);
	});

	test("rejects branch inputs alongside a local checkout", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		await expect(
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				checkout: "local",
				name: "x",
				branch: "feature/x",
			}),
		).rejects.toThrow(/local workspace uses the project's checkout/);
	});

	test("a local workspace can be renamed", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const created = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			checkout: "local",
		});
		const updated = await scenario.host.trpc.workspace.update.mutate({
			id: created.workspace.id,
			name: "payments",
		});
		expect(updated.name).toBe("payments");
	});
});
