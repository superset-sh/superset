import { describe, expect, it } from "bun:test";
import type { DetectedPort } from "@superset/port-scanner";
import type { HostDb } from "../db";
import { portManager } from "../ports/port-manager";
import type { WorkspaceFilesystemManager } from "../runtime/filesystem";
import { EventBus } from "./event-bus";
import type { GitWatcher } from "./git-watcher";

function createEventBus(sidebarCommandTimeoutMs?: number): EventBus {
	return new EventBus({
		db: {} as unknown as HostDb,
		filesystem: {
			resolveWorkspaceRoot: () => "/tmp/missing-workspace",
		} as unknown as WorkspaceFilesystemManager,
		gitWatcher: {
			onChanged: () => () => {},
		} as unknown as GitWatcher,
		sidebarCommandTimeoutMs,
	});
}

describe("EventBus sidebar commands", () => {
	it("resolves only after a renderer acknowledges with post-command state", async () => {
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

		const result = eventBus.requestSidebarCommand("machine-1", {
			action: "list",
		});
		const command = JSON.parse(sentMessages[0] ?? "{}");
		expect(command).toMatchObject({
			type: "sidebar:command",
			targetMachineId: "machine-1",
			command: { action: "list" },
		});

		eventBus.handleMessage(
			socket,
			JSON.stringify({
				type: "sidebar:result",
				commandId: command.commandId,
				ok: true,
				state: { groups: [], workspaces: [] },
			}),
		);
		await expect(result).resolves.toEqual({ groups: [], workspaces: [] });
	});

	it("rejects renderer failures and missing acknowledgements", async () => {
		const eventBus = createEventBus(10);
		const sentMessages: string[] = [];
		const socket = {
			readyState: 1,
			send(data: string) {
				sentMessages.push(data);
			},
			close() {},
		};
		eventBus.handleOpen(socket);

		const rejected = eventBus.requestSidebarCommand("machine-1", {
			action: "delete-group",
			groupId: "missing",
		});
		const command = JSON.parse(sentMessages[0] ?? "{}");
		eventBus.handleMessage(
			socket,
			JSON.stringify({
				type: "sidebar:result",
				commandId: command.commandId,
				ok: false,
				error: "Group not found: missing",
			}),
		);
		await expect(rejected).rejects.toThrow("Group not found: missing");

		const timedOut = eventBus.requestSidebarCommand("machine-1", {
			action: "list",
		});
		const secondCommand = JSON.parse(sentMessages[1] ?? "{}");
		// A syntactically valid packet without post-command state is not success.
		eventBus.handleMessage(
			socket,
			JSON.stringify({
				type: "sidebar:result",
				commandId: secondCommand.commandId,
				ok: true,
			}),
		);
		await expect(timedOut).rejects.toThrow("did not acknowledge");
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
