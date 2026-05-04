import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { TRPCClientError } from "@trpc/client";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import { cloudFlows, cloudOk } from "../helpers/cloud-fakes";
import {
	createBasicScenario,
	createFeatureWorktreeScenario,
	createProjectScenario,
} from "../helpers/scenarios";

describe("workspace.create + workspace.delete integration", () => {
	let dispose: (() => Promise<void>) | undefined;

	afterEach(async () => {
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
	});

	test("create() adds a worktree, calls cloud, and persists workspace row", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "new ws",
			branch: "feature/new",
		});

		expect(result?.workspace?.branch).toBe("feature/new");

		const persisted = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result?.workspace?.id ?? ""))
			.get();
		expect(persisted?.branch).toBe("feature/new");
		expect(persisted?.worktreePath).toBeTruthy();
		// Path scheme is `~/.superset/worktrees/<projectId>/<branch>` —
		// pin the suffix rather than the absolute path so the test isn't
		// HOME-dependent.
		expect(persisted?.worktreePath).toMatch(/feature\/new$/);
		expect(existsSync(persisted?.worktreePath ?? "")).toBe(true);
	});

	test("create() rolls back the worktree if cloud v2Workspace.create fails", async () => {
		const scenario = await createProjectScenario({
			hostOptions: {
				apiOverrides: {
					"host.ensure.mutate": cloudOk.hostEnsure(),
					"v2Workspace.create.mutate": () => {
						throw new Error("cloud-down");
					},
				},
			},
		});
		dispose = scenario.dispose;

		await expect(
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				name: "ws",
				branch: "feature/rollback",
			}),
		).rejects.toThrow(/cloud-down/);

		// New worktree scheme is `~/.superset/worktrees/<projectId>/<branch>`.
		// Rollback should leave nothing behind in the workspaces table either.
		const rows = scenario.host.db.select().from(workspaces).all();
		expect(rows).toHaveLength(0);
	});

	test("delete() rejects deleting a main workspace by path equality", async () => {
		const scenario = await createBasicScenario();
		dispose = scenario.dispose;

		await expect(
			scenario.host.trpc.workspace.delete.mutate({ id: scenario.workspaceId }),
		).rejects.toThrow(/Main workspaces cannot be deleted/i);
	});

	test("delete() removes the worktree and the local row on success", async () => {
		const scenario = await createFeatureWorktreeScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceDeleteOk() },
		});
		dispose = scenario.dispose;

		const result = await scenario.host.trpc.workspace.delete.mutate({
			id: scenario.featureWorkspaceId,
		});
		expect(result).toEqual({ success: true });

		expect(existsSync(scenario.worktreePath)).toBe(false);
		const rows = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.all();
		expect(rows).toHaveLength(0);
		expect(
			scenario.host.apiCalls.some(
				(c) => c.path === "v2Workspace.delete.mutate",
			),
		).toBe(true);
	});

	test("delete() requires authentication", async () => {
		const scenario = await createBasicScenario();
		dispose = scenario.dispose;

		await expect(
			scenario.host.unauthenticatedTrpc.workspace.delete.mutate({
				id: randomUUID(),
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});
});
