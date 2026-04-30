import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { eq } from "drizzle-orm";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("git router integration", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = randomUUID();
	const workspaceId = randomUUID();

	beforeEach(async () => {
		host = await createTestHost();
		repo = await createGitFixture();

		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath: repo.repoPath,
				branch: "main",
			})
			.run();
	});

	afterEach(async () => {
		await host.dispose();
		repo.dispose();
	});

	test("listBranches returns the current and other branches", async () => {
		await repo.git.checkoutLocalBranch("feature/x");
		await repo.commit("x work", { "x.txt": "x" });
		await repo.git.checkout("main");

		const result = await host.trpc.git.listBranches.query({ workspaceId });
		const names = result.branches.map((b) => b.name);
		expect(names).toContain("main");
		expect(names).toContain("feature/x");
	});

	test("listBranches throws NOT_FOUND for unknown workspace", async () => {
		await expect(
			host.trpc.git.listBranches.query({ workspaceId: "no-such-ws" }),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("getStatus on a clean repo reports no staged or unstaged changes", async () => {
		const status = await host.trpc.git.getStatus.query({ workspaceId });
		expect(status.staged).toEqual([]);
		expect(status.unstaged).toEqual([]);
	});

	test("getStatus reports modified and untracked files in unstaged", async () => {
		writeFileSync(join(repo.repoPath, "README.md"), "modified");
		writeFileSync(join(repo.repoPath, "new.txt"), "new file");

		const status = await host.trpc.git.getStatus.query({ workspaceId });
		const paths = status.unstaged.map((f) => f.path);
		expect(paths).toContain("README.md");
		expect(paths).toContain("new.txt");
		expect(status.unstaged.find((f) => f.path === "new.txt")?.status).toBe(
			"untracked",
		);
	});

	test("getBaseBranch returns null when not configured", async () => {
		const result = await host.trpc.git.getBaseBranch.query({ workspaceId });
		expect(result.baseBranch).toBeNull();
	});

	test("setBaseBranch persists to git config and is read back by getBaseBranch", async () => {
		await host.trpc.git.setBaseBranch.mutate({
			workspaceId,
			baseBranch: "main",
		});

		const result = await host.trpc.git.getBaseBranch.query({ workspaceId });
		expect(result.baseBranch).toBe("main");
	});

	test("setBaseBranch with null clears the configured base", async () => {
		await host.trpc.git.setBaseBranch.mutate({
			workspaceId,
			baseBranch: "main",
		});
		await host.trpc.git.setBaseBranch.mutate({
			workspaceId,
			baseBranch: null,
		});

		const result = await host.trpc.git.getBaseBranch.query({ workspaceId });
		expect(result.baseBranch).toBeNull();
	});

	test("renameBranch renames an unpushed branch", async () => {
		await repo.git.checkoutLocalBranch("feature/old");
		await repo.commit("work", { "f.txt": "f" });

		host.db
			.update(workspaces)
			.set({ branch: "feature/old" })
			.where(eq(workspaces.id, workspaceId))
			.run();

		const result = await host.trpc.git.renameBranch.mutate({
			workspaceId,
			oldName: "feature/old",
			newName: "feature/new",
		});

		expect(result.name).toBe("feature/new");
		const branches = await repo.git.branchLocal();
		expect(branches.all).toContain("feature/new");
		expect(branches.all).not.toContain("feature/old");
	});
});
