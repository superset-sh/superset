import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FsWatchEvent } from "../types";
import { createFsHostService } from "./service";

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
	const tempPath = await fs.mkdtemp(
		path.join(os.tmpdir(), "workspace-fs-host-service-"),
	);
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

describe("createFsHostService", () => {
	it("creates a file via writeFile and lists it", async () => {
		const rootPath = await createTempRoot();
		const service = createFsHostService({ rootPath });

		const filePath = path.join(rootPath, "notes.md");
		const writeResult = await service.writeFile({
			absolutePath: filePath,
			content: "# notes\n",
			encoding: "utf-8",
			options: { create: true, overwrite: false },
		});

		expect(writeResult.ok).toEqual(true);

		const { entries } = await service.listDirectory({
			absolutePath: rootPath,
		});

		expect(entries).toHaveLength(1);
		expect(entries[0]).toEqual({
			absolutePath: filePath,
			name: "notes.md",
			kind: "file",
		});

		await service.close();
	});

	it("streams watcher events through the host service contract", async () => {
		const listeners: Array<(batch: { events: FsWatchEvent[] }) => void> = [];
		let unsubscribed = false;

		const service = createFsHostService({
			rootPath: "/tmp/workspace",
			watcherManager: {
				async subscribe(_options, next) {
					listeners.push(next);
					return async () => {
						unsubscribed = true;
					};
				},
				async close() {},
			},
		});

		const iterator = service
			.watchPath({
				absolutePath: "/tmp/workspace",
				recursive: true,
			})
			[Symbol.asyncIterator]();

		const nextListener = listeners[0];
		if (!nextListener) {
			throw new Error("Listener was not registered");
		}

		nextListener({
			events: [
				{
					kind: "update",
					absolutePath: "/tmp/workspace/file.ts",
				},
			],
		});

		const nextValue = await iterator.next();
		expect(nextValue).toEqual({
			value: {
				events: [
					{
						kind: "update",
						absolutePath: "/tmp/workspace/file.ts",
					},
				],
			},
			done: false,
		});

		await iterator.return?.();
		expect(unsubscribed).toEqual(true);
	});
});
