import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BasicScenario, createBasicScenario } from "../helpers/scenarios";

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
