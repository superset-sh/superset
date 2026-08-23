import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { archiveLocalWorkspace } from "../../src/workspaces/local-workspace-store";
import { type BasicScenario, createBasicScenario } from "../helpers/scenarios";

describe("agents router integration", () => {
	let scenario: BasicScenario;

	beforeEach(async () => {
		scenario = await createBasicScenario();
	});

	afterEach(async () => {
		await scenario?.dispose();
	});

	// An archived workspace keeps its row (tombstone) but is semantically
	// gone. agents.run must answer with the id-bearing NOT_FOUND that
	// automation dispatch matches to clear a stale workspace pin and fall
	// back to a fresh workspace (#6521). Without the archived filter the
	// tombstone still resolved, and the failure surfaced one layer deeper
	// as a worktree-path error dispatch cannot match, so pinned automations
	// failed every run once their workspace was archived.
	test("run rejects an archived workspace with a NOT_FOUND naming the id", async () => {
		archiveLocalWorkspace(
			{
				db: scenario.host.db,
				eventBus: { broadcastWorkspaceChanged: () => {} } as never,
			},
			scenario.workspaceId,
			"merged",
		);

		await expect(
			scenario.host.trpc.agents.run.mutate({
				workspaceId: scenario.workspaceId,
				agent: "claude",
				prompt: "",
			}),
		).rejects.toMatchObject({
			data: { code: "NOT_FOUND" },
			message: expect.stringContaining(scenario.workspaceId),
		});
	});
});
