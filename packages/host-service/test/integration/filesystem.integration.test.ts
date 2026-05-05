import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { type BasicScenario, createBasicScenario } from "../helpers/scenarios";

describe("filesystem router integration", () => {
	let scenario: BasicScenario;

	beforeEach(async () => {
		scenario = await createBasicScenario();
	});

	afterEach(async () => {
		await scenario?.dispose();
	});

	test("listDirectory enumerates files in workspace root", async () => {
		writeFileSync(join(scenario.repo.repoPath, "alpha.txt"), "a");
		writeFileSync(join(scenario.repo.repoPath, "beta.txt"), "b");
		mkdirSync(join(scenario.repo.repoPath, "subdir"));

		const result = await scenario.host.trpc.filesystem.listDirectory.query({
			workspaceId: scenario.workspaceId,
			absolutePath: scenario.repo.repoPath,
		});
		const names = result.entries.map((e) => e.name);
		expect(names).toContain("alpha.txt");
		expect(names).toContain("beta.txt");
		expect(names).toContain("subdir");
	});

	test("listDirectory throws NOT_FOUND for unknown workspace", async () => {
		await expect(
			scenario.host.trpc.filesystem.listDirectory.query({
				workspaceId: "no-such-ws",
				absolutePath: scenario.repo.repoPath,
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("readFile returns text content", async () => {
		const filePath = join(scenario.repo.repoPath, "hello.txt");
		writeFileSync(filePath, "hello world");

		const result = await scenario.host.trpc.filesystem.readFile.query({
			workspaceId: scenario.workspaceId,
			absolutePath: filePath,
			encoding: "utf8",
		});
		expect(result.kind).toBe("text");
		if (result.kind === "text") {
			expect(result.content).toBe("hello world");
		}
	});

	test("writeFile creates a file with the given content", async () => {
		const filePath = join(scenario.repo.repoPath, "written.txt");
		await scenario.host.trpc.filesystem.writeFile.mutate({
			workspaceId: scenario.workspaceId,
			absolutePath: filePath,
			content: "from-trpc",
			options: { create: true, overwrite: true },
		});
		expect(readFileSync(filePath, "utf8")).toBe("from-trpc");
	});

	test("getMetadata returns size and type for an existing file", async () => {
		const filePath = join(scenario.repo.repoPath, "meta.txt");
		writeFileSync(filePath, "abcdef");
		const result = await scenario.host.trpc.filesystem.getMetadata.query({
			workspaceId: scenario.workspaceId,
			absolutePath: filePath,
		});
		expect(result.size).toBe(6);
	});

	test("statPath resolves a relative path inside workspace root", async () => {
		writeFileSync(join(scenario.repo.repoPath, "stat-target.txt"), "x");
		const result = await scenario.host.trpc.filesystem.statPath.mutate({
			workspaceId: scenario.workspaceId,
			path: "stat-target.txt",
		});
		expect(result).not.toBeNull();
		expect(result?.isDirectory).toBe(false);
		expect(result?.resolvedPath).toBe(
			join(scenario.repo.repoPath, "stat-target.txt"),
		);
	});

	test("statPath returns null for nonexistent paths", async () => {
		const result = await scenario.host.trpc.filesystem.statPath.mutate({
			workspaceId: scenario.workspaceId,
			path: "nope.txt",
		});
		expect(result).toBeNull();
	});

	test("searchFiles with empty query returns no matches", async () => {
		const result = await scenario.host.trpc.filesystem.searchFiles.query({
			workspaceId: scenario.workspaceId,
			query: "   ",
		});
		expect(result.matches).toEqual([]);
	});
});
