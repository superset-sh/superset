import { describe, expect, it } from "bun:test";
import type { DetectedPort } from "@superset/port-scanner";
import type { HostDb } from "../db";
import { portManager } from "../ports/port-manager";
import type { WorkspaceFilesystemManager } from "../runtime/filesystem";
import { EventBus } from "./event-bus";
import type { GitWatcher } from "./git-watcher";

function createEventBus(): EventBus {
	return new EventBus({
		db: {} as unknown as HostDb,
		filesystem: {
			resolveWorkspaceRoot: () => "/tmp/missing-workspace",
		} as unknown as WorkspaceFilesystemManager,
		gitWatcher: {
			onChanged: () => () => {},
		} as unknown as GitWatcher,
	});
}

describe("EventBus port events", () => {
	it("broadcasts port changes from the shared port manager and removes listeners on close", () => {
		const eventBus = createEventBus();
		const sentMessages: string[] = [];
		const socket = {
			readyState: 1,
			send(data: string) {
				sentMessages.push(data);
			},
			close() {},
		};
		const port: DetectedPort = {
			port: 5173,
			pid: 123,
			processName: "vite",
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
			detectedAt: 1_700_000_000_000,
			address: "127.0.0.1",
		};

		eventBus.handleOpen(socket);
		eventBus.start();
		eventBus.start();
		portManager.emit("port:add", port);

		expect(sentMessages).toHaveLength(1);
		const message = JSON.parse(sentMessages[0] ?? "{}");
		expect(message).toMatchObject({
			type: "port:changed",
			workspaceId: "workspace-1",
			eventType: "add",
			port,
			label: null,
		});
		expect(typeof message.occurredAt).toBe("number");

		portManager.emit("port:remove", port);
		expect(sentMessages).toHaveLength(2);
		expect(JSON.parse(sentMessages[1] ?? "{}")).toMatchObject({
			type: "port:changed",
			workspaceId: "workspace-1",
			eventType: "remove",
			port,
			label: null,
		});

		eventBus.close();
		portManager.emit("port:add", port);
		expect(sentMessages).toHaveLength(2);
	});
});

describe("EventBus fs:watch-file", () => {
	async function createFileWatchHarness(pruned: boolean) {
		const fs = await import("node:fs/promises");
		const os = await import("node:os");
		const path = await import("node:path");
		const root = await fs.realpath(
			await fs.mkdtemp(path.join(os.tmpdir(), "eb-watchfile-")),
		);
		const eventBus = new EventBus({
			db: {} as unknown as HostDb,
			filesystem: {
				resolveWorkspaceRoot: () => root,
				isPathPrunedFromWatch: () => pruned,
			} as unknown as WorkspaceFilesystemManager,
			gitWatcher: { onChanged: () => () => {} } as unknown as GitWatcher,
		});
		const sent: Array<{ type: string; events?: unknown[] }> = [];
		const socket = {
			readyState: 1,
			send(data: string) {
				sent.push(JSON.parse(data));
			},
			close() {},
		};
		eventBus.handleOpen(socket);
		return { root, eventBus, socket, sent, fs, path };
	}

	it("delivers exactly one event per change for a pruned path", async () => {
		const { root, eventBus, socket, sent, fs, path } =
			await createFileWatchHarness(true);
		const file = path.join(root, "buildout-file.js");
		await fs.writeFile(file, "v0");
		eventBus.handleMessage(
			socket,
			JSON.stringify({
				type: "fs:watch-file",
				workspaceId: "ws-1",
				absolutePath: file,
			}),
		);
		// Duplicate watch command must not double-deliver.
		eventBus.handleMessage(
			socket,
			JSON.stringify({
				type: "fs:watch-file",
				workspaceId: "ws-1",
				absolutePath: file,
			}),
		);
		await new Promise((r) => setTimeout(r, 250));

		await fs.writeFile(file, "v1");
		const deadline = Date.now() + 5_000;
		while (!sent.some((m) => m.type === "fs:events") && Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, 25));
		}
		// Let any (wrong) duplicate deliveries land before counting.
		await new Promise((r) => setTimeout(r, 300));

		const fsMessages = sent.filter((m) => m.type === "fs:events");
		expect(fsMessages).toHaveLength(1);

		eventBus.handleClose(socket);
		await fs.rm(root, { recursive: true, force: true });
	}, 15_000);

	it("is a no-op for a covered path (the recursive watcher owns delivery)", async () => {
		const { root, eventBus, socket, sent, fs, path } =
			await createFileWatchHarness(false);
		const file = path.join(root, "src-file.ts");
		await fs.writeFile(file, "v0");
		eventBus.handleMessage(
			socket,
			JSON.stringify({
				type: "fs:watch-file",
				workspaceId: "ws-1",
				absolutePath: file,
			}),
		);
		await new Promise((r) => setTimeout(r, 250));

		await fs.writeFile(file, "v1");
		await new Promise((r) => setTimeout(r, 500));

		expect(sent.filter((m) => m.type === "fs:events")).toHaveLength(0);

		// Unwatch of the no-op entry must not throw or leak.
		eventBus.handleMessage(
			socket,
			JSON.stringify({
				type: "fs:unwatch-file",
				workspaceId: "ws-1",
				absolutePath: file,
			}),
		);
		eventBus.handleClose(socket);
		await fs.rm(root, { recursive: true, force: true });
	}, 15_000);

	it("rejects paths outside the workspace root", async () => {
		const { root, eventBus, socket, sent, fs } =
			await createFileWatchHarness(true);
		for (const bad of ["/etc/hosts", `${root}/../escape.txt`, "relative.txt"]) {
			eventBus.handleMessage(
				socket,
				JSON.stringify({
					type: "fs:watch-file",
					workspaceId: "ws-1",
					absolutePath: bad,
				}),
			);
		}
		const errors = sent.filter((m) => m.type === "error");
		expect(errors).toHaveLength(3);
		eventBus.handleClose(socket);
		await fs.rm(root, { recursive: true, force: true });
	});
});
