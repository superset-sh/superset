import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import { type BasicScenario, createBasicScenario } from "../helpers/scenarios";

describe("git router integration", () => {
	let scenario: BasicScenario;

	beforeEach(async () => {
		scenario = await createBasicScenario();
	});

	afterEach(async () => {
		await scenario?.dispose();
	});

	test("listBranches returns the current and other branches", async () => {
		await scenario.repo.git.checkoutLocalBranch("feature/x");
		await scenario.repo.commit("x work", { "x.txt": "x" });
		await scenario.repo.git.checkout("main");

		const result = await scenario.host.trpc.git.listBranches.query({
			workspaceId: scenario.workspaceId,
		});
		const names = result.branches.map((b) => b.name);
		expect(names).toContain("main");
		expect(names).toContain("feature/x");
	});

	test("listBranches throws NOT_FOUND for unknown workspace", async () => {
		await expect(
			scenario.host.trpc.git.listBranches.query({ workspaceId: "no-such-ws" }),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("getStatus on a clean repo reports no staged or unstaged changes", async () => {
		const status = await scenario.host.trpc.git.getStatus.query({
			workspaceId: scenario.workspaceId,
		});
		expect(status.staged).toEqual([]);
		expect(status.unstaged).toEqual([]);
	});

	test("getStatus reports modified and untracked files in unstaged", async () => {
		writeFileSync(join(scenario.repo.repoPath, "README.md"), "modified");
		writeFileSync(join(scenario.repo.repoPath, "new.txt"), "new file");

		const status = await scenario.host.trpc.git.getStatus.query({
			workspaceId: scenario.workspaceId,
		});
		const paths = status.unstaged.map((f) => f.path);
		expect(paths).toContain("README.md");
		expect(paths).toContain("new.txt");
		expect(status.unstaged.find((f) => f.path === "new.txt")?.status).toBe(
			"untracked",
		);
	});

	test("getBaseBranch returns null when not configured", async () => {
		const result = await scenario.host.trpc.git.getBaseBranch.query({
			workspaceId: scenario.workspaceId,
		});
		expect(result.baseBranch).toBeNull();
	});

	test("setBaseBranch persists to git config and is read back by getBaseBranch", async () => {
		await scenario.host.trpc.git.setBaseBranch.mutate({
			workspaceId: scenario.workspaceId,
			baseBranch: "main",
		});

		const result = await scenario.host.trpc.git.getBaseBranch.query({
			workspaceId: scenario.workspaceId,
		});
		expect(result.baseBranch).toBe("main");
	});

	test("setBaseBranch with null clears the configured base", async () => {
		await scenario.host.trpc.git.setBaseBranch.mutate({
			workspaceId: scenario.workspaceId,
			baseBranch: "main",
		});
		await scenario.host.trpc.git.setBaseBranch.mutate({
			workspaceId: scenario.workspaceId,
			baseBranch: null,
		});

		const result = await scenario.host.trpc.git.getBaseBranch.query({
			workspaceId: scenario.workspaceId,
		});
		expect(result.baseBranch).toBeNull();
	});

	test("renameBranch renames an unpushed branch", async () => {
		await scenario.repo.git.checkoutLocalBranch("feature/old");
		await scenario.repo.commit("work", { "f.txt": "f" });

		scenario.host.db
			.update(workspaces)
			.set({ branch: "feature/old" })
			.where(eq(workspaces.id, scenario.workspaceId))
			.run();

		const result = await scenario.host.trpc.git.renameBranch.mutate({
			workspaceId: scenario.workspaceId,
			oldName: "feature/old",
			newName: "feature/new",
		});

		expect(result.name).toBe("feature/new");
		const branches = await scenario.repo.git.branchLocal();
		expect(branches.all).toContain("feature/new");
		expect(branches.all).not.toContain("feature/old");
	});
});
