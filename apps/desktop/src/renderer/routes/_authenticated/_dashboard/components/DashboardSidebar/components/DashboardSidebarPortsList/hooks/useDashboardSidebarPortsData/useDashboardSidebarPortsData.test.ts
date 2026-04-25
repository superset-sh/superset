import { describe, expect, it } from "bun:test";
import type { PortChangedPayload } from "@superset/workspace-client";
import {
	applyPortEventsToHostPortsResult,
	type HostPortsResult,
} from "./useDashboardSidebarPortsData";

function createResult(): HostPortsResult {
	return {
		hostId: "host-1",
		hostType: "local-device",
		hostUrl: "http://localhost:4567",
		ports: [
			{
				port: 5173,
				pid: 123,
				processName: "node",
				terminalId: "terminal-1",
				workspaceId: "workspace-1",
				detectedAt: 1,
				address: "127.0.0.1",
				label: "Frontend",
			},
		],
	};
}

function createPortEvent(
	eventType: PortChangedPayload["eventType"],
	overrides: Partial<PortChangedPayload["port"]> = {},
): PortChangedPayload {
	return {
		eventType,
		label: "Vite",
		occurredAt: 2,
		port: {
			port: 5173,
			pid: 456,
			processName: "vite",
			terminalId: "terminal-1",
			workspaceId: "workspace-1",
			detectedAt: 2,
			address: "0.0.0.0",
			...overrides,
		},
	};
}

describe("applyPortEventsToHostPortsResult", () => {
	it("applies a remove/add update as a single final port row", () => {
		const result = applyPortEventsToHostPortsResult(createResult(), [
			createPortEvent("remove", { pid: 123, processName: "node" }),
			createPortEvent("add"),
		]);

		expect(result?.ports).toHaveLength(1);
		expect(result?.ports[0]).toMatchObject({
			port: 5173,
			pid: 456,
			processName: "vite",
			address: "0.0.0.0",
			label: "Vite",
		});
	});

	it("keeps the same cache object for a remove event that does not match", () => {
		const initial = createResult();
		const result = applyPortEventsToHostPortsResult(initial, [
			createPortEvent("remove", { port: 3000 }),
		]);

		expect(result).toBe(initial);
	});
});
