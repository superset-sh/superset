import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	archiveLocalWorkspace,
	unarchiveLocalWorkspace,
} from "../../src/workspaces/local-workspace-store";
import {
	type BasicScenario,
	createBasicScenario,
	createFeatureWorktreeScenario,
} from "../helpers/scenarios";
import { seedWorkspace } from "../helpers/seed";

describe("workspace router integration", () => {
	let scenario: BasicScenario;

	beforeEach(async () => {
		scenario = await createBasicScenario();
	});

	afterEach(async () => {
		await scenario?.dispose();
	});

	test("get returns the workspace row", async () => {
		const ws = await scenario.host.trpc.workspace.get.query({
			id: scenario.workspaceId,
		});
		expect(ws.id).toBe(scenario.workspaceId);
		expect(ws.branch).toBe("main");
		expect(ws.worktreeExists).toBe(true);
	});

	test("get reports when the worktree path no longer exists", async () => {
		const featureScenario = await createFeatureWorktreeScenario();
		try {
			rmSync(featureScenario.worktreePath, { recursive: true, force: true });

			const ws = await featureScenario.host.trpc.workspace.get.query({
				id: featureScenario.featureWorkspaceId,
			});
			expect(ws.worktreePath).toBe(featureScenario.worktreePath);
			expect(ws.worktreeExists).toBe(false);
		} finally {
			await featureScenario.dispose();
		}
	});

	test("get throws NOT_FOUND for missing workspace", async () => {
		await expect(
			scenario.host.trpc.workspace.get.query({ id: "no-such-id" }),
		).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
	});

	test("gitStatus reports clean repo with no changes", async () => {
		const status = await scenario.host.trpc.workspace.gitStatus.query({
			id: scenario.workspaceId,
		});
		expect(status.workspaceId).toBe(scenario.workspaceId);
		expect(status.branch).toBe("main");
		expect(status.isClean).toBe(true);
		expect(status.files).toEqual([]);
	});

	test("gitStatus reports modified files when worktree is dirty", async () => {
		writeFileSync(
			join(scenario.repo.repoPath, "README.md"),
			"modified content",
		);
		writeFileSync(join(scenario.repo.repoPath, "new.txt"), "new file");

		const status = await scenario.host.trpc.workspace.gitStatus.query({
			id: scenario.workspaceId,
		});
		expect(status.isClean).toBe(false);
		const paths = status.files.map((f) => f.path).sort();
		expect(paths).toContain("README.md");
		expect(paths).toContain("new.txt");
	});

	test("gitStatus throws NOT_FOUND for missing workspace", async () => {
		await expect(
			scenario.host.trpc.workspace.gitStatus.query({ id: "no-such-id" }),
		).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
	});
});

describe("workspace list archive semantics", () => {
	let scenario: BasicScenario;

	beforeEach(async () => {
		scenario = await createBasicScenario();
	});

	afterEach(async () => {
		await scenario?.dispose();
	});

	function storeCtx() {
		return {
			db: scenario.host.db,
			eventBus: { broadcastWorkspaceChanged: () => {} } as never,
		};
	}

	test("list excludes archived rows by default and includes them on opt-in", async () => {
		const { id: archivedId } = seedWorkspace(scenario.host, {
			projectId: scenario.projectId,
			worktreePath: join(scenario.repo.repoPath, "..", "gone-worktree"),
			branch: "feature/gone",
		});
		archiveLocalWorkspace(storeCtx(), archivedId, "merged");

		const defaultList = await scenario.host.trpc.workspace.list.query();
		expect(defaultList.map((w) => w.id)).not.toContain(archivedId);
		expect(defaultList.map((w) => w.id)).toContain(scenario.workspaceId);

		const fullList = await scenario.host.trpc.workspace.list.query({
			includeArchived: true,
		});
		const archived = fullList.find((w) => w.id === archivedId);
		expect(archived).toBeDefined();
		expect(archived?.archiveReason).toBe("merged");
		expect(archived?.archivedAt).toBeGreaterThan(0);
		const live = fullList.find((w) => w.id === scenario.workspaceId);
		expect(live?.archivedAt).toBeNull();
		expect(live?.archiveReason).toBeNull();
	});

	test("archive is idempotent and unarchive restores the row", async () => {
		const { id } = seedWorkspace(scenario.host, {
			projectId: scenario.projectId,
			worktreePath: join(scenario.repo.repoPath, "..", "wt-2"),
			branch: "feature/two",
		});
		archiveLocalWorkspace(storeCtx(), id, "deleted");
		const first = await scenario.host.trpc.workspace.list.query({
			includeArchived: true,
		});
		const firstArchivedAt = first.find((w) => w.id === id)?.archivedAt;

		// Re-archiving with a different reason keeps the original tombstone.
		archiveLocalWorkspace(storeCtx(), id, "merged");
		const second = await scenario.host.trpc.workspace.list.query({
			includeArchived: true,
		});
		expect(second.find((w) => w.id === id)?.archivedAt).toBe(
			firstArchivedAt ?? -1,
		);
		expect(second.find((w) => w.id === id)?.archiveReason).toBe("deleted");

		unarchiveLocalWorkspace(storeCtx(), id);
		const restored = await scenario.host.trpc.workspace.list.query();
		expect(restored.map((w) => w.id)).toContain(id);
	});
});
