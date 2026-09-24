/**
 * Path-confinement regression suite for GHSA-6223-9p9j-gwf2 (absolute-path
 * reads) and GHSA-9v86-rjhr-mqw6 / GHSA-rg8v-v9gh-vwpq (symlink-ancestor
 * escapes in move/copy).
 *
 * Driven through `createFsHostService` rather than the raw `fs.ts` exports:
 * that is the object the host-service and desktop RPC handlers actually call,
 * so a regression in the plumbing (an op that stops passing `rootPath`) fails
 * here too, not just a regression in the guard itself.
 */
import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createFsHostService } from "./host/service";

const tempRoots: string[] = [];

async function createTempRoot(prefix: string): Promise<string> {
	const tempPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	const rootPath = await fs.realpath(tempPath);
	tempRoots.push(rootPath);
	return rootPath;
}

/** A workspace with `escape -> <outside>` committed inside it. */
async function createEscapeFixture(): Promise<{
	rootPath: string;
	outsidePath: string;
	escapePath: string;
}> {
	const rootPath = await createTempRoot("workspace-fs-confinement-root-");
	const outsidePath = await createTempRoot("workspace-fs-confinement-outside-");
	const escapePath = path.join(rootPath, "escape");
	await fs.symlink(outsidePath, escapePath);
	return { rootPath, outsidePath, escapePath };
}

afterEach(async () => {
	await Promise.all(
		tempRoots.splice(0).map(async (rootPath) => {
			await fs.rm(rootPath, { recursive: true, force: true });
		}),
	);
});

describe("read operations are confined to the workspace root", () => {
	it("readFile rejects an absolute path outside the root", async () => {
		const rootPath = await createTempRoot("workspace-fs-confinement-root-");
		const outsidePath = await createTempRoot(
			"workspace-fs-confinement-outside-",
		);
		const secretPath = path.join(outsidePath, "id_rsa");
		await fs.writeFile(secretPath, "private key");

		await expect(
			createFsHostService({ rootPath }).readFile({
				absolutePath: secretPath,
				encoding: "utf-8",
			}),
		).rejects.toThrow("outside workspace root");
	});

	it("listDirectory rejects an absolute path outside the root", async () => {
		const rootPath = await createTempRoot("workspace-fs-confinement-root-");
		const outsidePath = await createTempRoot(
			"workspace-fs-confinement-outside-",
		);

		await expect(
			createFsHostService({ rootPath }).listDirectory({
				absolutePath: outsidePath,
			}),
		).rejects.toThrow("outside workspace root");
	});

	it("getMetadata rejects an absolute path outside the root", async () => {
		const rootPath = await createTempRoot("workspace-fs-confinement-root-");
		const outsidePath = await createTempRoot(
			"workspace-fs-confinement-outside-",
		);
		const secretPath = path.join(outsidePath, "id_rsa");
		await fs.writeFile(secretPath, "private key");

		await expect(
			createFsHostService({ rootPath }).getMetadata({
				absolutePath: secretPath,
			}),
		).rejects.toThrow("outside workspace root");
	});

	it("reads through a symlinked ancestor are rejected", async () => {
		const { rootPath, outsidePath } = await createEscapeFixture();
		await fs.writeFile(path.join(outsidePath, "id_rsa"), "private key");

		await expect(
			createFsHostService({ rootPath }).readFile({
				absolutePath: path.join(rootPath, "escape", "id_rsa"),
				encoding: "utf-8",
			}),
		).rejects.toThrow(/outside workspace root/);
	});

	it("still serves the ordinary in-root flows", async () => {
		const rootPath = await createTempRoot("workspace-fs-confinement-root-");
		const service = createFsHostService({ rootPath });
		const filePath = path.join(rootPath, "notes.txt");
		await fs.writeFile(filePath, "hello");

		const read = await service.readFile({
			absolutePath: filePath,
			encoding: "utf-8",
		});
		const listed = await service.listDirectory({ absolutePath: rootPath });
		const metadata = await service.getMetadata({ absolutePath: filePath });
		const rootMetadata = await service.getMetadata({ absolutePath: rootPath });

		expect(read.kind).toEqual("text");
		expect(listed.entries.map((entry) => entry.name)).toEqual(["notes.txt"]);
		expect(metadata?.size).toEqual(5);
		expect(rootMetadata?.kind).toEqual("directory");
	});

	it("still reports metadata for an in-root symlink without following it", async () => {
		const { rootPath, outsidePath, escapePath } = await createEscapeFixture();

		const metadata = await createFsHostService({ rootPath }).getMetadata({
			absolutePath: escapePath,
		});

		expect(metadata?.kind).toEqual("symlink");
		expect(metadata?.symlinkTarget).toEqual(outsidePath);
	});
});

describe("movePath is confined to the workspace root", () => {
	it("rejects a destination under a symlinked ancestor", async () => {
		const { rootPath, outsidePath } = await createEscapeFixture();
		const sourceAbsolutePath = path.join(rootPath, "payload.txt");
		await fs.writeFile(sourceAbsolutePath, "payload");

		await expect(
			createFsHostService({ rootPath }).movePath({
				sourceAbsolutePath,
				destinationAbsolutePath: path.join(rootPath, "escape", "pwned.txt"),
			}),
		).rejects.toThrow(/outside workspace root/);
		expect(await fs.readdir(outsidePath)).toEqual([]);
	});

	it("rejects a source under a symlinked ancestor", async () => {
		const { rootPath, outsidePath } = await createEscapeFixture();
		await fs.writeFile(path.join(outsidePath, "id_rsa"), "private key");

		await expect(
			createFsHostService({ rootPath }).movePath({
				sourceAbsolutePath: path.join(rootPath, "escape", "id_rsa"),
				destinationAbsolutePath: path.join(rootPath, "stolen.txt"),
			}),
		).rejects.toThrow(/outside workspace root/);
		expect(await fs.readdir(outsidePath)).toEqual(["id_rsa"]);
	});

	it("still renames within the root", async () => {
		const rootPath = await createTempRoot("workspace-fs-confinement-root-");
		const sourceAbsolutePath = path.join(rootPath, "before.txt");
		const destinationAbsolutePath = path.join(rootPath, "nested", "after.txt");
		await fs.writeFile(sourceAbsolutePath, "payload");
		await fs.mkdir(path.join(rootPath, "nested"));

		await createFsHostService({ rootPath }).movePath({
			sourceAbsolutePath,
			destinationAbsolutePath,
		});

		expect(await fs.readFile(destinationAbsolutePath, "utf-8")).toEqual(
			"payload",
		);
	});
});

describe("copyPath is confined to the workspace root", () => {
	it("rejects a destination under a symlinked ancestor", async () => {
		const { rootPath, outsidePath } = await createEscapeFixture();
		const sourceAbsolutePath = path.join(rootPath, "payload.txt");
		await fs.writeFile(sourceAbsolutePath, "payload");

		await expect(
			createFsHostService({ rootPath }).copyPath({
				sourceAbsolutePath,
				destinationAbsolutePath: path.join(rootPath, "escape", "pwned.txt"),
			}),
		).rejects.toThrow(/outside workspace root/);
		expect(await fs.readdir(outsidePath)).toEqual([]);
	});

	it("rejects a source under a symlinked ancestor", async () => {
		const { rootPath, outsidePath } = await createEscapeFixture();
		await fs.writeFile(path.join(outsidePath, "id_rsa"), "private key");

		await expect(
			createFsHostService({ rootPath }).copyPath({
				sourceAbsolutePath: path.join(rootPath, "escape", "id_rsa"),
				destinationAbsolutePath: path.join(rootPath, "stolen.txt"),
			}),
		).rejects.toThrow(/outside workspace root/);
		expect(
			await fs
				.readFile(path.join(rootPath, "stolen.txt"), "utf-8")
				.catch(() => null),
		).toBeNull();
	});

	it("still copies within the root", async () => {
		const rootPath = await createTempRoot("workspace-fs-confinement-root-");
		const sourceAbsolutePath = path.join(rootPath, "original.txt");
		const destinationAbsolutePath = path.join(rootPath, "duplicate.txt");
		await fs.writeFile(sourceAbsolutePath, "payload");

		await createFsHostService({ rootPath }).copyPath({
			sourceAbsolutePath,
			destinationAbsolutePath,
		});

		expect(await fs.readFile(destinationAbsolutePath, "utf-8")).toEqual(
			"payload",
		);
	});
});
