import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { projects, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("filesystem router integration", () => {
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

	test("listDirectory enumerates files in workspace root", async () => {
		writeFileSync(join(repo.repoPath, "alpha.txt"), "a");
		writeFileSync(join(repo.repoPath, "beta.txt"), "b");
		mkdirSync(join(repo.repoPath, "subdir"));

		const result = await host.trpc.filesystem.listDirectory.query({
			workspaceId,
			absolutePath: repo.repoPath,
		});
		const names = result.entries.map((e) => e.name);
		expect(names).toContain("alpha.txt");
		expect(names).toContain("beta.txt");
		expect(names).toContain("subdir");
	});

	test("listDirectory throws NOT_FOUND for unknown workspace", async () => {
		expect(
			host.trpc.filesystem.listDirectory.query({
				workspaceId: "no-such-ws",
				absolutePath: repo.repoPath,
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("readFile returns text content", async () => {
		const filePath = join(repo.repoPath, "hello.txt");
		writeFileSync(filePath, "hello world");

		const result = await host.trpc.filesystem.readFile.query({
			workspaceId,
			absolutePath: filePath,
			encoding: "utf8",
		});
		expect(result.kind).toBe("text");
		if (result.kind === "text") {
			expect(result.content).toBe("hello world");
		}
	});

	test("writeFile creates a file with the given content", async () => {
		const filePath = join(repo.repoPath, "written.txt");
		await host.trpc.filesystem.writeFile.mutate({
			workspaceId,
			absolutePath: filePath,
			content: "from-trpc",
			options: { create: true, overwrite: true },
		});
		expect(readFileSync(filePath, "utf8")).toBe("from-trpc");
	});

	test("getMetadata returns size and type for an existing file", async () => {
		const filePath = join(repo.repoPath, "meta.txt");
		writeFileSync(filePath, "abcdef");
		const result = await host.trpc.filesystem.getMetadata.query({
			workspaceId,
			absolutePath: filePath,
		});
		expect(result.size).toBe(6);
	});

	test("statPath resolves a relative path inside workspace root", async () => {
		writeFileSync(join(repo.repoPath, "stat-target.txt"), "x");
		const result = await host.trpc.filesystem.statPath.mutate({
			workspaceId,
			path: "stat-target.txt",
		});
		expect(result).not.toBeNull();
		expect(result?.isDirectory).toBe(false);
		expect(result?.resolvedPath).toBe(join(repo.repoPath, "stat-target.txt"));
	});

	test("statPath returns null for nonexistent paths", async () => {
		const result = await host.trpc.filesystem.statPath.mutate({
			workspaceId,
			path: "nope.txt",
		});
		expect(result).toBeNull();
	});

	test("searchFiles with empty query returns no matches", async () => {
		const result = await host.trpc.filesystem.searchFiles.query({
			workspaceId,
			query: "   ",
		});
		expect(result.matches).toEqual([]);
	});
});
