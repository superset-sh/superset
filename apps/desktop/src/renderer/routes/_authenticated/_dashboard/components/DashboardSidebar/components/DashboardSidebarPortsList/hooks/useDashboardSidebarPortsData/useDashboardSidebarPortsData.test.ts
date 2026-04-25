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

	it("creates an initial host result when an add event arrives before the snapshot", () => {
		const result = applyPortEventsToHostPortsResult(
			undefined,
			[
				createPortEvent("add", {
					port: 4000,
					pid: 999,
					processName: "newproc",
				}),
			],
			{
				hostId: "host-1",
				hostType: "local-device",
				hostUrl: "http://localhost:4567",
			},
		);

		expect(result).toMatchObject({
			hostId: "host-1",
			hostType: "local-device",
			hostUrl: "http://localhost:4567",
		});
		expect(result?.ports).toHaveLength(1);
		expect(result?.ports[0]).toMatchObject({
			port: 4000,
			pid: 999,
			processName: "newproc",
			address: "0.0.0.0",
			label: "Vite",
		});
	});

	it("does not create an initial host result for a remove-only event", () => {
		const result = applyPortEventsToHostPortsResult(
			undefined,
			[createPortEvent("remove")],
			{
				hostId: "host-1",
				hostType: "local-device",
				hostUrl: "http://localhost:4567",
			},
		);

		expect(result).toBeUndefined();
	});

	it("appends a new add event to an existing snapshot", () => {
		const result = applyPortEventsToHostPortsResult(createResult(), [
			createPortEvent("add", { port: 4000, pid: 999, processName: "newproc" }),
		]);

		expect(result?.ports).toHaveLength(2);
		expect(result?.ports.find((port) => port.port === 4000)).toMatchObject({
			port: 4000,
			pid: 999,
			processName: "newproc",
			label: "Vite",
		});
	});

	it("replaces an existing row on add for the same terminal port", () => {
		const result = applyPortEventsToHostPortsResult(createResult(), [
			createPortEvent("add", { pid: 999, processName: "newproc" }),
		]);

		expect(result?.ports).toHaveLength(1);
		expect(result?.ports[0]).toMatchObject({
			port: 5173,
			pid: 999,
			processName: "newproc",
			label: "Vite",
		});
	});
});
