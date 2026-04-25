import { describe, expect, it } from "bun:test";
import type { DetectedPort } from "@superset/port-scanner";
import type { HostDb } from "../db";
import type { WorkspaceFilesystemManager } from "../runtime/filesystem";
import { EventBus } from "./event-bus";

function createEventBus(): EventBus {
	return new EventBus({
		db: {} as unknown as HostDb,
		filesystem: {} as unknown as WorkspaceFilesystemManager,
	});
}

describe("EventBus port events", () => {
	it("broadcasts port changes with the owning workspace id", () => {
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
		eventBus.broadcastPortChanged({ eventType: "add", port });

		expect(sentMessages).toHaveLength(1);
		const message = JSON.parse(sentMessages[0] ?? "{}");
		expect(message).toMatchObject({
			type: "port:changed",
			workspaceId: "workspace-1",
			eventType: "add",
			port,
		});
		expect(typeof message.occurredAt).toBe("number");
	});
});
