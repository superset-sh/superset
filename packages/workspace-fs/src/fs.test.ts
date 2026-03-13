import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { guardedWriteTextFile, listDirectory, readFileBufferUpTo } from "./fs";

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
	const tempPath = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-fs-fs-"));
	const rootPath = await fs.realpath(tempPath);
	tempRoots.push(rootPath);
	return rootPath;
}

afterEach(async () => {
	await Promise.all(
		tempRoots.splice(0).map(async (rootPath) => {
			await fs.rm(rootPath, { recursive: true, force: true });
		}),
	);
});

describe("readFileBufferUpTo", () => {
	it("reads small files without reporting an overflow", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "notes.txt");
		await fs.writeFile(absolutePath, "hello");

		const result = await readFileBufferUpTo({
			rootPath,
			absolutePath,
			maxBytes: 10,
		});

		expect(result.exceededLimit).toEqual(false);
		expect(Buffer.from(result.buffer).toString("utf-8")).toEqual("hello");
	});

	it("caps reads at the limit and reports overflow", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "large.txt");
		await fs.writeFile(absolutePath, "abcdefghij");

		const result = await readFileBufferUpTo({
			rootPath,
			absolutePath,
			maxBytes: 4,
		});

		expect(result.exceededLimit).toEqual(true);
		expect(Buffer.from(result.buffer).toString("utf-8")).toEqual("abcd");
	});
});

describe("listDirectory", () => {
	it("reports symlinked directories as directories", async () => {
		const rootPath = await createTempRoot();

		// Create a real directory with a file inside
		const realDir = path.join(rootPath, "real-dir");
		await fs.mkdir(realDir);
		await fs.writeFile(path.join(realDir, "file.txt"), "content");

		// Create a parent directory that contains a symlink to the real directory
		const parentDir = path.join(rootPath, ".claude");
		await fs.mkdir(parentDir);
		await fs.symlink(realDir, path.join(parentDir, "commands"));

		// Also create a regular file and regular directory for comparison
		await fs.writeFile(path.join(parentDir, "config.json"), "{}");
		await fs.mkdir(path.join(parentDir, "rules"));

		const entries = await listDirectory({
			rootPath,
			absolutePath: parentDir,
		});

		const commandsEntry = entries.find((e) => e.name === "commands");
		const configEntry = entries.find((e) => e.name === "config.json");
		const rulesEntry = entries.find((e) => e.name === "rules");

		// The symlinked directory should be reported as a directory
		expect(commandsEntry).toBeDefined();
		expect(commandsEntry?.isDirectory).toBe(true);

		// Regular file should still be a file
		expect(configEntry).toBeDefined();
		expect(configEntry?.isDirectory).toBe(false);

		// Regular directory should still be a directory
		expect(rulesEntry).toBeDefined();
		expect(rulesEntry?.isDirectory).toBe(true);
	});

	it("reports symlinked files as files", async () => {
		const rootPath = await createTempRoot();

		const realFile = path.join(rootPath, "real-file.txt");
		await fs.writeFile(realFile, "content");

		await fs.symlink(realFile, path.join(rootPath, "link.txt"));

		const entries = await listDirectory({
			rootPath,
			absolutePath: rootPath,
		});

		const linkEntry = entries.find((e) => e.name === "link.txt");
		expect(linkEntry).toBeDefined();
		expect(linkEntry?.isDirectory).toBe(false);
	});

	it("handles broken symlinks gracefully", async () => {
		const rootPath = await createTempRoot();

		// Create a symlink pointing to a non-existent target
		await fs.symlink(
			path.join(rootPath, "does-not-exist"),
			path.join(rootPath, "broken-link"),
		);

		const entries = await listDirectory({
			rootPath,
			absolutePath: rootPath,
		});

		const brokenEntry = entries.find((e) => e.name === "broken-link");
		expect(brokenEntry).toBeDefined();
		expect(brokenEntry?.isDirectory).toBe(false);
	});

	it("sorts directories before files including symlinked directories", async () => {
		const rootPath = await createTempRoot();

		const realDir = path.join(rootPath, "target-dir");
		await fs.mkdir(realDir);

		await fs.symlink(realDir, path.join(rootPath, "z-symlinked-dir"));
		await fs.writeFile(path.join(rootPath, "a-file.txt"), "content");
		await fs.mkdir(path.join(rootPath, "b-real-dir"));

		const entries = await listDirectory({
			rootPath,
			absolutePath: rootPath,
		});

		// Filter out the target-dir itself
		const filtered = entries.filter((e) => e.name !== "target-dir");

		// Directories (real and symlinked) should come before files
		const directoryNames = filtered
			.filter((e) => e.isDirectory)
			.map((e) => e.name);
		const fileNames = filtered.filter((e) => !e.isDirectory).map((e) => e.name);

		expect(directoryNames).toContain("b-real-dir");
		expect(directoryNames).toContain("z-symlinked-dir");
		expect(fileNames).toContain("a-file.txt");

		// Verify directories come first in the sorted list
		const firstFileIndex = filtered.findIndex((e) => !e.isDirectory);
		const lastDirIndex = filtered.findLastIndex((e) => e.isDirectory);
		if (firstFileIndex !== -1 && lastDirIndex !== -1) {
			expect(lastDirIndex).toBeLessThan(firstFileIndex);
		}
	});
});

describe("guardedWriteTextFile", () => {
	it("returns a conflict when the expected content is stale", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "notes.txt");
		await fs.writeFile(absolutePath, "current");

		const result = await guardedWriteTextFile({
			rootPath,
			absolutePath,
			content: "next",
			expectedContent: "stale",
		});

		expect(result).toEqual({
			status: "conflict",
			currentContent: "current",
		});
		expect(await fs.readFile(absolutePath, "utf-8")).toEqual("current");
	});

	it("serializes concurrent guarded writes to the same file", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "notes.txt");
		await fs.writeFile(absolutePath, "base");

		const [firstResult, secondResult] = await Promise.all([
			guardedWriteTextFile({
				rootPath,
				absolutePath,
				content: "first",
				expectedContent: "base",
			}),
			guardedWriteTextFile({
				rootPath,
				absolutePath,
				content: "second",
				expectedContent: "base",
			}),
		]);

		const savedResults = [firstResult, secondResult].filter(
			(result) => result.status === "saved",
		);
		const conflictResults = [firstResult, secondResult].filter(
			(result) => result.status === "conflict",
		);

		expect(savedResults).toHaveLength(1);
		expect(conflictResults).toHaveLength(1);

		const finalContent = await fs.readFile(absolutePath, "utf-8");
		expect(["first", "second"]).toContain(finalContent);
		expect(conflictResults[0]).toEqual({
			status: "conflict",
			currentContent: finalContent,
		});
	});
});
