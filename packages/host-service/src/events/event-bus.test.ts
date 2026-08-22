import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DetectedPort } from "@superset/port-scanner";
import type { HostDb } from "../db";
import { portManager } from "../ports/port-manager";
import { invalidateStaticPortCache } from "../ports/static-ports";
import type { WorkspaceFilesystemManager } from "../runtime/filesystem";
import { EventBus } from "./event-bus";
import type { GitWatcher } from "./git-watcher";

function createEventBus(worktreePath = "/tmp/missing-workspace"): EventBus {
	return new EventBus({
		db: {} as unknown as HostDb,
		filesystem: {
			resolveWorkspaceRoot: () => worktreePath,
		} as unknown as WorkspaceFilesystemManager,
		gitWatcher: {
			onChanged: () => () => {},
		} as unknown as GitWatcher,
	});
}

/** A worktree whose `.superset/ports.json` declares one port. */
function createWorktree(entry: Record<string, unknown>): string {
	const worktreePath = mkdtempSync(join(tmpdir(), "superset-event-bus-"));
	mkdirSync(join(worktreePath, ".superset"), { recursive: true });
	writeFileSync(
		join(worktreePath, ".superset", "ports.json"),
		JSON.stringify({ ports: [entry] }),
	);
	worktreePaths.push(worktreePath);
	return worktreePath;
}

/** Collects everything the bus broadcasts to one connected client. */
function createSocket(): {
	socket: Parameters<EventBus["handleOpen"]>[0];
	sent: string[];
} {
	const sent: string[] = [];
	return {
		socket: {
			readyState: 1,
			send(data: string) {
				sent.push(data);
			},
			close() {},
		},
		sent,
	};
}

const worktreePaths: string[] = [];

afterEach(() => {
	// The cache is module-level and keyed by workspaceId, so it outlives a test.
	invalidateStaticPortCache();
	for (const path of worktreePaths.splice(0)) {
		rmSync(path, { recursive: true, force: true });
	}
});

describe("EventBus port events", () => {
	it("broadcasts port changes from the shared port manager and removes listeners on close", () => {
		const eventBus = createEventBus();
		const { socket, sent: sentMessages } = createSocket();
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
			scheme: null,
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
			scheme: null,
		});

		eventBus.close();
		portManager.emit("port:add", port);
		expect(sentMessages).toHaveLength(2);
	});

	it("carries the label and scheme declared in ports.json on an add event", () => {
		const worktreePath = createWorktree({
			port: 3030,
			label: "web",
			scheme: "https",
		});
		const eventBus = createEventBus(worktreePath);
		const { socket, sent: sentMessages } = createSocket();

		eventBus.handleOpen(socket);
		eventBus.start();

		portManager.emit("port:add", {
			port: 3030,
			pid: 321,
			processName: "next",
			terminalId: "terminal-2",
			workspaceId: "workspace-https",
			detectedAt: 1_700_000_000_001,
			address: "127.0.0.1",
		});

		expect(JSON.parse(sentMessages[0] ?? "{}")).toMatchObject({
			type: "port:changed",
			eventType: "add",
			label: "web",
			scheme: "https",
		});

		eventBus.close();
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

	it("dedupes duplicate watch commands (one unwatch stops delivery)", async () => {
		const { root, eventBus, socket, sent, fs, path } =
			await createFileWatchHarness(true);
		const file = path.join(root, "buildout-file.js");
		await fs.writeFile(file, "v0");
		const watch = JSON.stringify({
			type: "fs:watch-file",
			workspaceId: "ws-1",
			absolutePath: file,
		});
		eventBus.handleMessage(socket, watch);
		// Duplicate watch must not install a second watcher.
		eventBus.handleMessage(socket, watch);
		await new Promise((r) => setTimeout(r, 250));

		// A single unwatch disposes the only watcher there should be. If the
		// duplicate had installed a second one, it would survive this and keep
		// delivering. Asserting silence is deterministic; asserting an exact
		// event count is not, because OS file watchers coalesce or double-fire
		// a single write differently per platform.
		eventBus.handleMessage(
			socket,
			JSON.stringify({
				type: "fs:unwatch-file",
				workspaceId: "ws-1",
				absolutePath: file,
			}),
		);
		sent.length = 0;

		await fs.writeFile(file, "v1");
		await new Promise((r) => setTimeout(r, 600));

		expect(sent.filter((m) => m.type === "fs:events")).toHaveLength(0);

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
