import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDirectory, listDirectory, readFile, writeFile } from "./fs";

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

describe("readFile", () => {
	it("reads a text file with encoding", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "notes.txt");
		await fs.writeFile(absolutePath, "hello");

		const result = await readFile({
			rootPath,
			absolutePath,
			encoding: "utf-8",
		});

		expect(result.kind).toEqual("text");
		if (result.kind === "text") {
			expect(result.content).toEqual("hello");
		}
		expect(result.byteLength).toEqual(5);
		expect(result.exceededLimit).toEqual(false);
		expect(result.revision).toBeTruthy();
	});

	it("reads bytes when no encoding is provided", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "data.bin");
		await fs.writeFile(absolutePath, Buffer.from([0x01, 0x02, 0x03]));

		const result = await readFile({
			rootPath,
			absolutePath,
		});

		expect(result.kind).toEqual("bytes");
		if (result.kind === "bytes") {
			expect(result.content).toEqual(new Uint8Array([0x01, 0x02, 0x03]));
		}
		expect(result.byteLength).toEqual(3);
		expect(result.exceededLimit).toEqual(false);
	});

	it("respects maxBytes and reports exceededLimit", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "large.txt");
		await fs.writeFile(absolutePath, "abcdefghij");

		const result = await readFile({
			rootPath,
			absolutePath,
			maxBytes: 4,
			encoding: "utf-8",
		});

		expect(result.kind).toEqual("text");
		if (result.kind === "text") {
			expect(result.content).toEqual("abcd");
		}
		expect(result.byteLength).toEqual(4);
		expect(result.exceededLimit).toEqual(true);
	});

	it("reads from offset", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "offset.txt");
		await fs.writeFile(absolutePath, "abcdefghij");

		const result = await readFile({
			rootPath,
			absolutePath,
			offset: 3,
			encoding: "utf-8",
		});

		expect(result.kind).toEqual("text");
		if (result.kind === "text") {
			expect(result.content).toEqual("defghij");
		}
		expect(result.exceededLimit).toEqual(false);
	});

	it("reads small file without exceeding limit", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "notes.txt");
		await fs.writeFile(absolutePath, "hello");

		const result = await readFile({
			rootPath,
			absolutePath,
			maxBytes: 10,
		});

		expect(result.exceededLimit).toEqual(false);
		if (result.kind === "bytes") {
			expect(Buffer.from(result.content).toString("utf-8")).toEqual("hello");
		}
	});
});

describe("writeFile", () => {
	it("returns a conflict when revision does not match", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "notes.txt");
		await fs.writeFile(absolutePath, "current");

		const result = await writeFile({
			rootPath,
			absolutePath,
			content: "next",
			precondition: { ifMatch: "stale-revision" },
		});

		expect(result.ok).toEqual(false);
		if (!result.ok) {
			expect(result.reason).toEqual("conflict");
		}
		expect(await fs.readFile(absolutePath, "utf-8")).toEqual("current");
	});

	it("writes successfully when revision matches", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "notes.txt");
		await fs.writeFile(absolutePath, "current");

		const readResult = await readFile({
			rootPath,
			absolutePath,
			encoding: "utf-8",
		});

		const result = await writeFile({
			rootPath,
			absolutePath,
			content: "updated",
			precondition: { ifMatch: readResult.revision },
		});

		expect(result.ok).toEqual(true);
		expect(await fs.readFile(absolutePath, "utf-8")).toEqual("updated");
	});

	it("returns exists when create-only and file exists", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "existing.txt");
		await fs.writeFile(absolutePath, "content");

		const result = await writeFile({
			rootPath,
			absolutePath,
			content: "new content",
			options: { create: true, overwrite: false },
		});

		expect(result.ok).toEqual(false);
		if (!result.ok) {
			expect(result.reason).toEqual("exists");
		}
	});

	it("returns not-found when update-only and file missing", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "missing.txt");

		const result = await writeFile({
			rootPath,
			absolutePath,
			content: "content",
			options: { create: false, overwrite: true },
		});

		expect(result.ok).toEqual(false);
		if (!result.ok) {
			expect(result.reason).toEqual("not-found");
		}
	});

	it("serializes concurrent precondition writes", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "notes.txt");
		await fs.writeFile(absolutePath, "base");

		const readResult = await readFile({
			rootPath,
			absolutePath,
			encoding: "utf-8",
		});
		const revision = readResult.revision;

		const [firstResult, secondResult] = await Promise.all([
			writeFile({
				rootPath,
				absolutePath,
				content: "first",
				precondition: { ifMatch: revision },
			}),
			writeFile({
				rootPath,
				absolutePath,
				content: "second",
				precondition: { ifMatch: revision },
			}),
		]);

		const successes = [firstResult, secondResult].filter((r) => r.ok);
		const conflicts = [firstResult, secondResult].filter((r) => !r.ok);

		expect(successes).toHaveLength(1);
		expect(conflicts).toHaveLength(1);
	});

	it("writes Uint8Array content", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "binary.bin");

		const result = await writeFile({
			rootPath,
			absolutePath,
			content: new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]),
		});

		expect(result.ok).toEqual(true);
		const written = await fs.readFile(absolutePath);
		expect(written.toString("utf-8")).toEqual("Hello");
	});
});

describe("createDirectory", () => {
	it("creates a nested directory tree when recursive is enabled", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "nested", "deeper", "folder");

		const result = await createDirectory({
			rootPath,
			absolutePath,
			recursive: true,
		});

		expect(result).toEqual({
			absolutePath,
			kind: "directory",
		});

		const stats = await fs.stat(absolutePath);
		expect(stats.isDirectory()).toEqual(true);
	});

	it("fails for missing parents when recursive is disabled", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "nested", "deeper", "folder");
		let didThrow = false;

		try {
			await createDirectory({
				rootPath,
				absolutePath,
			});
		} catch {
			didThrow = true;
		}

		expect(didThrow).toEqual(true);
	});
});

// Reproduces #5320: opening a workspace whose tree contains a large
// non-gitignored directory (e.g. nested node_modules, ~150k+ entries) drives
// the renderer's V8 heap to its ~4 GB ceiling and crashes it (exitCode 5),
// then re-crashes on reload -> permanent crash loop.
//
// `listDirectory` is the enumeration primitive every Files View tree consumes
// (renderer FilesView / useFileTree / v2 FilesTab all fetch through it via
// `filesystem.listDirectory`). Unlike the search-index walk and the file
// watcher — both of which bound themselves (`DEFAULT_IGNORE_PATTERNS`,
// `FILE_PATHS_MAX`, `MAX_BUFFERED_EVENTS`) — this primitive returned every
// entry in a directory with no cap, so a single huge directory forces the
// renderer to materialize an unbounded number of tree nodes.
describe("listDirectory", () => {
	it("lists entries with directories sorted before files", async () => {
		const rootPath = await createTempRoot();
		await fs.writeFile(path.join(rootPath, "b.txt"), "");
		await fs.mkdir(path.join(rootPath, "a-dir"));

		const { entries, truncated } = await listDirectory({
			rootPath,
			absolutePath: rootPath,
		});

		expect(entries.map((entry) => entry.name)).toEqual(["a-dir", "b.txt"]);
		expect(truncated).toEqual(false);
	});

	it("caps the number of entries returned and flags truncation", async () => {
		const rootPath = await createTempRoot();
		// A directory with many direct children. Without a cap the renderer
		// receives every entry and materializes a tree node per file.
		const fileCount = 50;
		await Promise.all(
			Array.from({ length: fileCount }, (_, index) =>
				fs.writeFile(
					path.join(rootPath, `file-${String(index).padStart(4, "0")}.txt`),
					"",
				),
			),
		);

		const limit = 10;
		const { entries, truncated } = await listDirectory({
			rootPath,
			absolutePath: rootPath,
			limit,
		});

		expect(entries.length).toEqual(limit);
		expect(truncated).toEqual(true);
	});

	it("does not flag truncation when entry count is within the cap", async () => {
		const rootPath = await createTempRoot();
		await Promise.all(
			Array.from({ length: 5 }, (_, index) =>
				fs.writeFile(path.join(rootPath, `file-${index}.txt`), ""),
			),
		);

		const { entries, truncated } = await listDirectory({
			rootPath,
			absolutePath: rootPath,
			limit: 10,
		});

		expect(entries.length).toEqual(5);
		expect(truncated).toEqual(false);
	});
});
