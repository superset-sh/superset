import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createProjectScenario } from "../helpers/scenarios";
import { seedWorkspace } from "../helpers/seed";

describe("workspaceCreation.searchBranches integration", () => {
	let scenario: Awaited<ReturnType<typeof createProjectScenario>>;

	beforeEach(async () => {
		scenario = await createProjectScenario();
	});

	afterEach(async () => {
		await scenario.dispose();
	});

	test("returns empty result when project is unknown", async () => {
		const result =
			await scenario.host.trpc.workspaceCreation.searchBranches.query({
				projectId: "no-such-project",
			});
		expect(result).toEqual({
			defaultBranch: null,
			items: [],
			nextCursor: null,
		});
	});

	test("lists local branches sorted with default branch first", async () => {
		await scenario.repo.git.checkoutLocalBranch("feature/alpha");
		await scenario.repo.commit("alpha work", { "alpha.txt": "alpha" });
		await scenario.repo.git.checkout("main");
		await scenario.repo.git.checkoutLocalBranch("feature/beta");
		await scenario.repo.commit("beta work", { "beta.txt": "beta" });
		await scenario.repo.git.checkout("main");

		const result =
			await scenario.host.trpc.workspaceCreation.searchBranches.query({
				projectId: scenario.projectId,
			});

		expect(result.defaultBranch).toBe("main");
		const names = result.items.map((b) => b.name);
		expect(names[0]).toBe("main");
		expect(names).toContain("feature/alpha");
		expect(names).toContain("feature/beta");
		const main = result.items.find((b) => b.name === "main");
		expect(main?.isLocal).toBe(true);
		expect(main?.isRemote).toBe(false);
		expect(main?.hasWorkspace).toBe(false);
	});

	test("filters by query substring (case-insensitive)", async () => {
		await scenario.repo.git.checkoutLocalBranch("Feature/Alpha");
		await scenario.repo.commit("a", { "a.txt": "a" });
		await scenario.repo.git.checkout("main");
		await scenario.repo.git.checkoutLocalBranch("bugfix/zeta");
		await scenario.repo.commit("z", { "z.txt": "z" });
		await scenario.repo.git.checkout("main");

		const result =
			await scenario.host.trpc.workspaceCreation.searchBranches.query({
				projectId: scenario.projectId,
				query: "alpha",
			});
		expect(result.items.map((b) => b.name)).toEqual(["Feature/Alpha"]);
	});

	test("respects limit and emits a cursor when more pages exist", async () => {
		for (let i = 0; i < 5; i++) {
			await scenario.repo.git.checkoutLocalBranch(`branch-${i}`);
			await scenario.repo.commit(`commit ${i}`, { [`f${i}.txt`]: `${i}` });
			await scenario.repo.git.checkout("main");
		}

		const page1 =
			await scenario.host.trpc.workspaceCreation.searchBranches.query({
				projectId: scenario.projectId,
				limit: 2,
			});
		expect(page1.items).toHaveLength(2);
		expect(page1.nextCursor).not.toBeNull();

		const page2 =
			await scenario.host.trpc.workspaceCreation.searchBranches.query({
				projectId: scenario.projectId,
				limit: 2,
				cursor: page1.nextCursor ?? undefined,
			});
		expect(page2.items).toHaveLength(2);
		const seen = new Set([
			...page1.items.map((b) => b.name),
			...page2.items.map((b) => b.name),
		]);
		expect(seen.size).toBe(4);
	});

	test("marks branches as having a workspace when a workspace row exists", async () => {
		await scenario.repo.git.checkoutLocalBranch("with-workspace");
		await scenario.repo.commit("ws", { "ws.txt": "ws" });
		await scenario.repo.git.checkout("main");

		seedWorkspace(scenario.host, {
			projectId: scenario.projectId,
			worktreePath: `${scenario.repo.repoPath}/.worktrees/with-workspace`,
			branch: "with-workspace",
		});

		const result =
			await scenario.host.trpc.workspaceCreation.searchBranches.query({
				projectId: scenario.projectId,
			});
		const branch = result.items.find((b) => b.name === "with-workspace");
		expect(branch?.hasWorkspace).toBe(true);
	});
});
