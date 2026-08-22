import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	createDirectory,
	createUniqueEntry,
	movePath,
	readFile,
	removeEmptyDirectory,
	removeFileIfUnchanged,
	writeFile,
} from "./fs";

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

	it("reads files outside the workspace root", async () => {
		const rootPath = await createTempRoot();
		const outsideRoot = await createTempRoot();
		const absolutePath = path.join(outsideRoot, "outside.txt");
		await fs.writeFile(absolutePath, "outside");

		const result = await readFile({
			rootPath,
			absolutePath,
			encoding: "utf-8",
		});

		expect(result.kind).toEqual("text");
		if (result.kind === "text") {
			expect(result.content).toEqual("outside");
		}
	});

	it("rejects in-root symlinks that resolve outside the workspace root", async () => {
		const rootPath = await createTempRoot();
		const outsideRoot = await createTempRoot();
		const targetPath = path.join(outsideRoot, "secret.txt");
		await fs.writeFile(targetPath, "secret");
		const linkPath = path.join(rootPath, "innocent.txt");
		await fs.symlink(targetPath, linkPath);

		await expect(
			readFile({
				rootPath,
				absolutePath: linkPath,
				encoding: "utf-8",
			}),
		).rejects.toThrow("outside workspace root");
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
	it("rejects paths outside the workspace root", async () => {
		const rootPath = await createTempRoot();
		const outsideRoot = await createTempRoot();
		const absolutePath = path.join(outsideRoot, "escape.txt");

		await expect(
			writeFile({
				rootPath,
				absolutePath,
				content: "should not exist",
			}),
		).rejects.toThrow("outside workspace root");
	});

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

describe("createUniqueEntry", () => {
	it("uses the base name when nothing collides", async () => {
		const rootPath = await createTempRoot();

		const result = await createUniqueEntry({
			rootPath,
			parentAbsolutePath: rootPath,
			baseName: "Untitled",
			kind: "directory",
		});

		expect(result.ok).toEqual(true);
		if (!result.ok) return;
		expect(result.name).toEqual("Untitled");
		expect(result.absolutePath).toEqual(path.join(rootPath, "Untitled"));
		expect((await fs.stat(result.absolutePath)).isDirectory()).toEqual(true);
	});

	// The Files tab used to pick names from a client-side cache. A directory that
	// exists on disk but is absent from that cache must still not be adopted —
	// the caller deletes what it creates when the user cancels.
	it("never adopts an existing directory", async () => {
		const rootPath = await createTempRoot();
		const existing = path.join(rootPath, "Untitled");
		await fs.mkdir(existing);
		await fs.writeFile(path.join(existing, "keep.txt"), "precious");

		const result = await createUniqueEntry({
			rootPath,
			parentAbsolutePath: rootPath,
			baseName: "Untitled",
			kind: "directory",
		});

		expect(result.ok).toEqual(true);
		if (!result.ok) return;
		expect(result.name).toEqual("Untitled-2");
		expect(
			(await fs.readFile(path.join(existing, "keep.txt"))).toString(),
		).toEqual("precious");
	});

	it("never adopts an existing file", async () => {
		const rootPath = await createTempRoot();
		await fs.writeFile(path.join(rootPath, "untitled"), "precious");

		const result = await createUniqueEntry({
			rootPath,
			parentAbsolutePath: rootPath,
			baseName: "untitled",
			kind: "file",
		});

		expect(result.ok).toEqual(true);
		if (!result.ok) return;
		expect(result.name).toEqual("untitled-2");
		expect(
			(await fs.readFile(path.join(rootPath, "untitled"))).toString(),
		).toEqual("precious");
		expect(result.revision).toBeTruthy();
	});

	it("keeps counting past the first collision", async () => {
		const rootPath = await createTempRoot();
		await fs.mkdir(path.join(rootPath, "Untitled"));
		await fs.mkdir(path.join(rootPath, "Untitled-2"));

		const result = await createUniqueEntry({
			rootPath,
			parentAbsolutePath: rootPath,
			baseName: "Untitled",
			kind: "directory",
		});

		expect(result.ok).toEqual(true);
		if (!result.ok) return;
		expect(result.name).toEqual("Untitled-3");
	});

	it("rejects names that are not a single path leaf", async () => {
		const rootPath = await createTempRoot();
		const rejected = ["", "   ", ".", "..", "a/b", "a\\b", "a\0b"];

		for (const baseName of rejected) {
			const result = await createUniqueEntry({
				rootPath,
				parentAbsolutePath: rootPath,
				baseName,
				kind: "directory",
			});
			expect(result).toEqual({ ok: false, reason: "invalid-name" });
		}

		// Nothing was created for any of them.
		expect(await fs.readdir(rootPath)).toEqual([]);
	});

	it("reports exhausted once every candidate is taken", async () => {
		const rootPath = await createTempRoot();
		await fs.mkdir(path.join(rootPath, "Untitled"));
		for (let index = 2; index <= 100; index++) {
			await fs.mkdir(path.join(rootPath, `Untitled-${index}`));
		}

		const result = await createUniqueEntry({
			rootPath,
			parentAbsolutePath: rootPath,
			baseName: "Untitled",
			kind: "directory",
		});

		expect(result).toEqual({ ok: false, reason: "exhausted" });
	});

	it("rejects a parent outside the workspace root", async () => {
		const rootPath = await createTempRoot();
		const outsideRoot = await createTempRoot();
		let didThrow = false;

		try {
			await createUniqueEntry({
				rootPath,
				parentAbsolutePath: outsideRoot,
				baseName: "Untitled",
				kind: "directory",
			});
		} catch {
			didThrow = true;
		}

		expect(didThrow).toEqual(true);
	});
});

describe("removeEmptyDirectory", () => {
	it("removes an empty directory", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "Untitled");
		await fs.mkdir(absolutePath);

		expect(await removeEmptyDirectory({ rootPath, absolutePath })).toEqual({
			ok: true,
		});
		expect(await fs.readdir(rootPath)).toEqual([]);
	});

	// The cancel path must be incapable of destroying data.
	it("keeps a populated directory and leaves its contents intact", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "Untitled");
		await fs.mkdir(absolutePath);
		await fs.writeFile(path.join(absolutePath, "keep.txt"), "precious");

		expect(await removeEmptyDirectory({ rootPath, absolutePath })).toEqual({
			ok: false,
			reason: "not-empty",
		});
		expect(
			(await fs.readFile(path.join(absolutePath, "keep.txt"))).toString(),
		).toEqual("precious");
	});

	it("treats an already-missing directory as removed", async () => {
		const rootPath = await createTempRoot();

		expect(
			await removeEmptyDirectory({
				rootPath,
				absolutePath: path.join(rootPath, "gone"),
			}),
		).toEqual({ ok: true });
	});

	it("reports wrong-type for a file", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "notes.txt");
		await fs.writeFile(absolutePath, "hello");

		expect(await removeEmptyDirectory({ rootPath, absolutePath })).toEqual({
			ok: false,
			reason: "wrong-type",
		});
		expect((await fs.readFile(absolutePath)).toString()).toEqual("hello");
	});

	it("refuses the workspace root", async () => {
		const rootPath = await createTempRoot();
		let didThrow = false;

		try {
			await removeEmptyDirectory({ rootPath, absolutePath: rootPath });
		} catch {
			didThrow = true;
		}

		expect(didThrow).toEqual(true);
		expect((await fs.stat(rootPath)).isDirectory()).toEqual(true);
	});
});

describe("removeFileIfUnchanged", () => {
	it("removes a file whose revision still matches", async () => {
		const rootPath = await createTempRoot();
		const created = await createUniqueEntry({
			rootPath,
			parentAbsolutePath: rootPath,
			baseName: "untitled",
			kind: "file",
		});
		expect(created.ok).toEqual(true);
		expect(created.ok && created.revision).toBeTruthy();
		if (!created.ok || created.revision === undefined) return;

		expect(
			await removeFileIfUnchanged({
				rootPath,
				absolutePath: created.absolutePath,
				revision: created.revision,
			}),
		).toEqual({ ok: true });
		expect(await fs.readdir(rootPath)).toEqual([]);
	});

	it("keeps a file that changed after creation", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "untitled");
		await fs.writeFile(absolutePath, "written by someone else");

		expect(
			await removeFileIfUnchanged({
				rootPath,
				absolutePath,
				revision: "0:0",
			}),
		).toEqual({ ok: false, reason: "modified" });
		expect((await fs.readFile(absolutePath)).toString()).toEqual(
			"written by someone else",
		);
	});

	it("treats an already-missing file as removed", async () => {
		const rootPath = await createTempRoot();

		expect(
			await removeFileIfUnchanged({
				rootPath,
				absolutePath: path.join(rootPath, "gone"),
				revision: "0:0",
			}),
		).toEqual({ ok: true });
	});

	it("reports wrong-type for a directory", async () => {
		const rootPath = await createTempRoot();
		const absolutePath = path.join(rootPath, "folder");
		await fs.mkdir(absolutePath);

		expect(
			await removeFileIfUnchanged({
				rootPath,
				absolutePath,
				revision: "0:0",
			}),
		).toEqual({ ok: false, reason: "wrong-type" });
		expect((await fs.stat(absolutePath)).isDirectory()).toEqual(true);
	});
});

describe("movePath", () => {
	it("renames a directory onto a free name", async () => {
		const rootPath = await createTempRoot();
		const sourceAbsolutePath = path.join(rootPath, "Untitled");
		const destinationAbsolutePath = path.join(rootPath, ".claude");
		await fs.mkdir(sourceAbsolutePath);

		await movePath({ rootPath, sourceAbsolutePath, destinationAbsolutePath });

		expect((await fs.stat(destinationAbsolutePath)).isDirectory()).toEqual(
			true,
		);
		expect(await fs.readdir(rootPath)).toEqual([".claude"]);
	});

	// The exact backend behaviour behind the reported bug: the Files tab asked to
	// rename a placeholder directory that had never been created.
	it("throws ENOENT when the source does not exist", async () => {
		const rootPath = await createTempRoot();
		let code: string | undefined;

		try {
			await movePath({
				rootPath,
				sourceAbsolutePath: path.join(rootPath, "Untitled"),
				destinationAbsolutePath: path.join(rootPath, ".claude"),
			});
		} catch (error) {
			code = (error as NodeJS.ErrnoException).code;
		}

		expect(code).toEqual("ENOENT");
	});

	it("rejects a destination that already exists", async () => {
		const rootPath = await createTempRoot();
		const sourceAbsolutePath = path.join(rootPath, "Untitled");
		const destinationAbsolutePath = path.join(rootPath, ".claude");
		await fs.mkdir(sourceAbsolutePath);
		await fs.mkdir(destinationAbsolutePath);
		let didThrow = false;

		try {
			await movePath({ rootPath, sourceAbsolutePath, destinationAbsolutePath });
		} catch {
			didThrow = true;
		}

		expect(didThrow).toEqual(true);
		expect((await fs.stat(sourceAbsolutePath)).isDirectory()).toEqual(true);
	});
});
