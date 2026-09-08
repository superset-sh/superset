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

describe("EventBus agent binding events", () => {
	it("broadcasts invalidation-only binding changes to every client", () => {
		const eventBus = createEventBus();
		const sentMessages: string[] = [];
		const socket = {
			readyState: 1,
			send(data: string) {
				sentMessages.push(data);
			},
			close() {},
		};
		eventBus.handleOpen(socket);

		eventBus.broadcastAgentBindingsChanged({
			workspaceId: "workspace-1",
			occurredAt: 1_700_000_000_000,
		});

		expect(sentMessages).toHaveLength(1);
		expect(JSON.parse(sentMessages[0] ?? "{}")).toEqual({
			type: "agent:bindings-changed",
			workspaceId: "workspace-1",
			occurredAt: 1_700_000_000_000,
		});
	});
});

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
		const gitEvents: unknown[][] = [];
		const eventBus = new EventBus({
			db: {} as unknown as HostDb,
			filesystem: {
				resolveWorkspaceRoot: () => root,
				isPathPrunedFromWatch: () => pruned,
			} as unknown as WorkspaceFilesystemManager,
			gitWatcher: {
				onChanged: () => () => {},
				notifyWorktreeEvents: (...args: unknown[]) => gitEvents.push(args),
			} as unknown as GitWatcher,
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
		return { root, eventBus, socket, sent, fs, path, gitEvents };
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

	it("forwards a targeted edit to Git consumers as well as the editor", async () => {
		const { root, eventBus, socket, sent, fs, path, gitEvents } =
			await createFileWatchHarness(true);
		const file = path.join(root, "editor.txt");
		try {
			await fs.writeFile(file, "initial");
			eventBus.handleMessage(
				socket,
				JSON.stringify({
					type: "fs:watch-file",
					workspaceId: "ws-1",
					absolutePath: file,
				}),
			);
			const waitForEvent = async () => {
				const deadline = Date.now() + 3000;
				while (!gitEvents.length && Date.now() < deadline)
					await new Promise((resolve) => setTimeout(resolve, 10));
				expect(gitEvents.length).toBeGreaterThan(0);
			};
			await waitForEvent(); // Initial catch-up proves the resource has attached.
			gitEvents.length = 0;
			sent.length = 0;
			await fs.writeFile(`${file}.tmp`, "atomic edit");
			await fs.rename(`${file}.tmp`, file);
			await waitForEvent();
			expect(gitEvents[0]).toEqual([
				"ws-1",
				root,
				[{ kind: "update", absolutePath: file, isDirectory: false }],
			]);
			expect(sent.some((message) => message.type === "fs:events")).toBe(true);
		} finally {
			eventBus.handleClose(socket);
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it("covered paths do not consume the targeted-watch budget", async () => {
		const { root, eventBus, socket, sent, fs } =
			await createFileWatchHarness(false);
		for (let i = 0; i < 300; i++)
			eventBus.handleMessage(
				socket,
				JSON.stringify({
					type: "fs:watch-file",
					workspaceId: "ws-1",
					absolutePath: `${root}/covered-${i}`,
				}),
			);
		expect(sent.filter((message) => message.type === "error")).toEqual([]);
		eventBus.handleClose(socket);
		await fs.rm(root, { recursive: true, force: true });
	});

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
