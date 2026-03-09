import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { WorkspaceFsWatchEvent } from "../types";
import { createWorkspaceFsHostService } from "./service";

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
	const rootPath = await fs.mkdtemp(
		path.join(os.tmpdir(), "workspace-fs-host-service-"),
	);
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

describe("createWorkspaceFsHostService", () => {
	it("resolves workspace roots for create and list operations", async () => {
		const rootPath = await createTempRoot();
		const service = createWorkspaceFsHostService({
			resolveRootPath: (workspaceId) => {
				expect(workspaceId).toEqual("workspace-1");
				return rootPath;
			},
		});

		const filePath = path.join(rootPath, "notes.md");
		await service.createFile({
			workspaceId: "workspace-1",
			absolutePath: filePath,
			content: "# notes\n",
		});

		const entries = await service.listDirectory({
			workspaceId: "workspace-1",
			absolutePath: rootPath,
		});

		expect(entries).toHaveLength(1);
		expect(entries[0]).toEqual({
			absolutePath: filePath,
			id: filePath,
			isDirectory: false,
			name: "notes.md",
			relativePath: "notes.md",
		});

		await service.close();
	});

	it("streams watcher events through the host service contract", async () => {
		const listeners: Array<(event: WorkspaceFsWatchEvent) => void> = [];
		let unsubscribed = false;

		const service = createWorkspaceFsHostService({
			resolveRootPath: () => "/tmp/workspace",
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
			.watchWorkspace({
				workspaceId: "workspace-1",
			})
			[Symbol.asyncIterator]();

		const nextListener = listeners[0];
		if (!nextListener) {
			throw new Error("Listener was not registered");
		}

		nextListener({
			type: "update",
			workspaceId: "workspace-1",
			absolutePath: "/tmp/workspace/file.ts",
			isDirectory: false,
			revision: 3,
		});

		const nextValue = await iterator.next();
		expect(nextValue).toEqual({
			value: {
				type: "update",
				workspaceId: "workspace-1",
				absolutePath: "/tmp/workspace/file.ts",
				isDirectory: false,
				revision: 3,
			},
			done: false,
		});

		await iterator.return?.();
		expect(unsubscribed).toEqual(true);
	});

	it("exposes service info with capabilities derived from host options", async () => {
		const service = createWorkspaceFsHostService({
			resolveRootPath: () => "/tmp/workspace",
			watcherManager: {
				async subscribe() {
					return async () => {};
				},
				async close() {},
			},
		});

		const serviceInfo = await service.getServiceInfo();
		expect(serviceInfo).toEqual({
			hostKind: "local",
			resourceScheme: "workspace-fs",
			pathIdentity: "absolute-path",
			capabilities: {
				read: true,
				write: true,
				watch: true,
				searchFiles: true,
				searchKeyword: true,
				trash: false,
				resourceUris: true,
			},
		});
	});
});
