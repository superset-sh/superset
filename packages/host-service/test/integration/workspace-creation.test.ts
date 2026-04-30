import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("workspaceCreation.searchBranches integration", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = "project-under-test";

	beforeEach(async () => {
		host = await createTestHost();
		repo = await createGitFixture();

		host.db
			.insert(projects)
			.values({
				id: projectId,
				repoPath: repo.repoPath,
				createdAt: Date.now(),
			})
			.run();
	});

	afterEach(async () => {
		await host.dispose();
		repo.dispose();
	});

	test("returns empty result when project is unknown", async () => {
		const result = await host.trpc.workspaceCreation.searchBranches.query({
			projectId: "no-such-project",
		});
		expect(result).toEqual({
			defaultBranch: null,
			items: [],
			nextCursor: null,
		});
	});

	test("lists local branches sorted with default branch first", async () => {
		await repo.git.checkoutLocalBranch("feature/alpha");
		await repo.commit("alpha work", { "alpha.txt": "alpha" });
		await repo.git.checkout("main");
		await repo.git.checkoutLocalBranch("feature/beta");
		await repo.commit("beta work", { "beta.txt": "beta" });
		await repo.git.checkout("main");

		const result = await host.trpc.workspaceCreation.searchBranches.query({
			projectId,
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
		await repo.git.checkoutLocalBranch("Feature/Alpha");
		await repo.commit("a", { "a.txt": "a" });
		await repo.git.checkout("main");
		await repo.git.checkoutLocalBranch("bugfix/zeta");
		await repo.commit("z", { "z.txt": "z" });
		await repo.git.checkout("main");

		const result = await host.trpc.workspaceCreation.searchBranches.query({
			projectId,
			query: "alpha",
		});
		expect(result.items.map((b) => b.name)).toEqual(["Feature/Alpha"]);
	});

	test("respects limit and emits a cursor when more pages exist", async () => {
		for (let i = 0; i < 5; i++) {
			await repo.git.checkoutLocalBranch(`branch-${i}`);
			await repo.commit(`commit ${i}`, { [`f${i}.txt`]: `${i}` });
			await repo.git.checkout("main");
		}

		const page1 = await host.trpc.workspaceCreation.searchBranches.query({
			projectId,
			limit: 2,
		});
		expect(page1.items).toHaveLength(2);
		expect(page1.nextCursor).not.toBeNull();

		const page2 = await host.trpc.workspaceCreation.searchBranches.query({
			projectId,
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
		await repo.git.checkoutLocalBranch("with-workspace");
		await repo.commit("ws", { "ws.txt": "ws" });
		await repo.git.checkout("main");

		host.db
			.insert(workspaces)
			.values({
				id: "ws-1",
				projectId,
				worktreePath: `${repo.repoPath}/.worktrees/with-workspace`,
				branch: "with-workspace",
				createdAt: Date.now(),
			})
			.run();

		const result = await host.trpc.workspaceCreation.searchBranches.query({
			projectId,
		});
		const branch = result.items.find((b) => b.name === "with-workspace");
		expect(branch?.hasWorkspace).toBe(true);
	});
});
