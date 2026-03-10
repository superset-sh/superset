import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { guardedWriteTextFile, readFileBufferUpTo } from "./fs";

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
