import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("workspace router integration", () => {
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

	test("get returns the workspace row", async () => {
		const ws = await host.trpc.workspace.get.query({ id: workspaceId });
		expect(ws.id).toBe(workspaceId);
		expect(ws.branch).toBe("main");
	});

	test("get throws NOT_FOUND for missing workspace", async () => {
		expect(
			host.trpc.workspace.get.query({ id: "no-such-id" }),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("gitStatus reports clean repo with no changes", async () => {
		const status = await host.trpc.workspace.gitStatus.query({
			id: workspaceId,
		});
		expect(status.workspaceId).toBe(workspaceId);
		expect(status.branch).toBe("main");
		expect(status.isClean).toBe(true);
		expect(status.files).toEqual([]);
	});

	test("gitStatus reports modified files when worktree is dirty", async () => {
		writeFileSync(join(repo.repoPath, "README.md"), "modified content");
		writeFileSync(join(repo.repoPath, "new.txt"), "new file");

		const status = await host.trpc.workspace.gitStatus.query({
			id: workspaceId,
		});
		expect(status.isClean).toBe(false);
		const paths = status.files.map((f) => f.path).sort();
		expect(paths).toContain("README.md");
		expect(paths).toContain("new.txt");
	});

	test("gitStatus throws NOT_FOUND for missing workspace", async () => {
		expect(
			host.trpc.workspace.gitStatus.query({ id: "no-such-id" }),
		).rejects.toBeInstanceOf(TRPCClientError);
	});
});
