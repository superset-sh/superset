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

	// The Files tab creates an entry on disk, then opens an inline rename on it,
	// then either moves it (commit) or removes it (cancel). Exercised end to end
	// here because a break anywhere along it either loses the user's folder or
	// leaves the tree describing something that doesn't exist.
	describe("provisional entry lifecycle", () => {
		test("create → rename commits the entry under its new name", async () => {
			const created =
				await scenario.host.trpc.filesystem.createUniqueEntry.mutate({
					workspaceId: scenario.workspaceId,
					parentAbsolutePath: scenario.repo.repoPath,
					baseName: "Untitled",
					kind: "directory",
				});
			expect(created.ok).toBe(true);
			if (!created.ok) return;
			expect(created.name).toBe("Untitled");

			await scenario.host.trpc.filesystem.movePath.mutate({
				workspaceId: scenario.workspaceId,
				sourceAbsolutePath: created.absolutePath,
				destinationAbsolutePath: join(scenario.repo.repoPath, ".claude"),
			});

			const entries = await scenario.host.trpc.filesystem.listDirectory.query({
				workspaceId: scenario.workspaceId,
				absolutePath: scenario.repo.repoPath,
			});
			const names = entries.entries.map((e) => e.name);
			expect(names).toContain(".claude");
			expect(names).not.toContain("Untitled");
		});

		test("create → cancel removes the entry", async () => {
			const created =
				await scenario.host.trpc.filesystem.createUniqueEntry.mutate({
					workspaceId: scenario.workspaceId,
					parentAbsolutePath: scenario.repo.repoPath,
					baseName: "Untitled",
					kind: "directory",
				});
			expect(created.ok).toBe(true);
			if (!created.ok) return;

			const removed =
				await scenario.host.trpc.filesystem.removeEmptyDirectory.mutate({
					workspaceId: scenario.workspaceId,
					absolutePath: created.absolutePath,
				});
			expect(removed).toEqual({ ok: true });

			const entries = await scenario.host.trpc.filesystem.listDirectory.query({
				workspaceId: scenario.workspaceId,
				absolutePath: scenario.repo.repoPath,
			});
			expect(entries.entries.map((e) => e.name)).not.toContain("Untitled");
		});

		test("cancel keeps the folder once something is inside it", async () => {
			const created =
				await scenario.host.trpc.filesystem.createUniqueEntry.mutate({
					workspaceId: scenario.workspaceId,
					parentAbsolutePath: scenario.repo.repoPath,
					baseName: "Untitled",
					kind: "directory",
				});
			expect(created.ok).toBe(true);
			if (!created.ok) return;

			writeFileSync(join(created.absolutePath, "precious.txt"), "keep me");

			const removed =
				await scenario.host.trpc.filesystem.removeEmptyDirectory.mutate({
					workspaceId: scenario.workspaceId,
					absolutePath: created.absolutePath,
				});
			expect(removed).toEqual({ ok: false, reason: "not-empty" });
			expect(
				readFileSync(join(created.absolutePath, "precious.txt"), "utf8"),
			).toBe("keep me");
		});

		test("never adopts a directory that already exists on disk", async () => {
			const existing = join(scenario.repo.repoPath, "Untitled");
			mkdirSync(existing);
			writeFileSync(join(existing, "precious.txt"), "keep me");

			const created =
				await scenario.host.trpc.filesystem.createUniqueEntry.mutate({
					workspaceId: scenario.workspaceId,
					parentAbsolutePath: scenario.repo.repoPath,
					baseName: "Untitled",
					kind: "directory",
				});
			expect(created.ok).toBe(true);
			if (!created.ok) return;
			expect(created.name).toBe("Untitled-2");

			// Cancelling the new one must not touch the pre-existing one.
			await scenario.host.trpc.filesystem.removeEmptyDirectory.mutate({
				workspaceId: scenario.workspaceId,
				absolutePath: created.absolutePath,
			});
			expect(readFileSync(join(existing, "precious.txt"), "utf8")).toBe(
				"keep me",
			);
		});

		test("file create → cancel is guarded by the creation revision", async () => {
			const created =
				await scenario.host.trpc.filesystem.createUniqueEntry.mutate({
					workspaceId: scenario.workspaceId,
					parentAbsolutePath: scenario.repo.repoPath,
					baseName: "untitled",
					kind: "file",
				});
			expect(created.ok).toBe(true);
			expect(created.ok && created.revision).toBeTruthy();
			if (!created.ok || created.revision === undefined) return;

			// Someone wrote to it after we created it — cancelling must not delete it.
			writeFileSync(created.absolutePath, "typed by the user");
			expect(
				await scenario.host.trpc.filesystem.removeFileIfUnchanged.mutate({
					workspaceId: scenario.workspaceId,
					absolutePath: created.absolutePath,
					revision: created.revision,
				}),
			).toEqual({ ok: false, reason: "modified" });
			expect(readFileSync(created.absolutePath, "utf8")).toBe(
				"typed by the user",
			);
		});

		test("rejects a baseName that is not a single path leaf", async () => {
			const result =
				await scenario.host.trpc.filesystem.createUniqueEntry.mutate({
					workspaceId: scenario.workspaceId,
					parentAbsolutePath: scenario.repo.repoPath,
					baseName: "../escaped",
					kind: "directory",
				});
			expect(result).toEqual({ ok: false, reason: "invalid-name" });
		});
	});
});
