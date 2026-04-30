import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	clearProgress,
	setProgress,
} from "../../src/trpc/router/workspace-creation/shared/progress-store";
import { createTestHost } from "../helpers/createTestHost";
import {
	type BasicScenario,
	createBasicScenario,
	createProjectScenario,
} from "../helpers/scenarios";

describe("workspaceCreation misc procedures", () => {
	let basic: BasicScenario;

	beforeEach(async () => {
		basic = await createBasicScenario();
	});

	afterEach(async () => {
		await basic.dispose();
	});

	test("getContext reports hasLocalRepo=false for unknown project", async () => {
		const result = await basic.host.trpc.workspaceCreation.getContext.query({
			projectId: randomUUID(),
		});
		expect(result.hasLocalRepo).toBe(false);
		expect(result.defaultBranch).toBeNull();
	});

	test("getContext returns defaultBranch when project exists locally", async () => {
		const proj = await createProjectScenario();
		try {
			const result = await proj.host.trpc.workspaceCreation.getContext.query({
				projectId: proj.projectId,
			});
			expect(result.hasLocalRepo).toBe(true);
			expect(result.defaultBranch).toBe("main");
		} finally {
			await proj.dispose();
		}
	});

	test("getProgress returns null for unknown pendingId", async () => {
		const host = await createTestHost();
		try {
			const result = await host.trpc.workspaceCreation.getProgress.query({
				pendingId: "no-such-id",
			});
			expect(result).toBeNull();
		} finally {
			await host.dispose();
		}
	});

	test("getProgress reflects state set via the in-memory store", async () => {
		const pendingId = randomUUID();
		// `progress-store` is a module-level Map, so any test entry has to
		// be cleaned up explicitly — otherwise it leaks across suites and
		// only `sweepStaleProgress` (every 5 min) clears it.
		setProgress(pendingId, "creating_worktree");
		try {
			const result = await basic.host.trpc.workspaceCreation.getProgress.query({
				pendingId,
			});
			expect(result).not.toBeNull();
			const steps = result?.steps ?? [];
			expect(steps.find((s) => s.id === "ensuring_repo")?.status).toBe("done");
			expect(steps.find((s) => s.id === "creating_worktree")?.status).toBe(
				"active",
			);
			expect(steps.find((s) => s.id === "registering")?.status).toBe("pending");
		} finally {
			clearProgress(pendingId);
		}
	});

	test("generateBranchName returns null for empty prompts (no AI call)", async () => {
		const proj = await createProjectScenario();
		try {
			const result =
				await proj.host.trpc.workspaceCreation.generateBranchName.mutate({
					projectId: proj.projectId,
					prompt: "   ",
				});
			expect(result.branchName).toBeNull();
		} finally {
			await proj.dispose();
		}
	});

	test("generateBranchName returns null when project is unknown", async () => {
		const result =
			await basic.host.trpc.workspaceCreation.generateBranchName.mutate({
				projectId: randomUUID(),
				prompt: "fix the bug",
			});
		expect(result.branchName).toBeNull();
	});
});
