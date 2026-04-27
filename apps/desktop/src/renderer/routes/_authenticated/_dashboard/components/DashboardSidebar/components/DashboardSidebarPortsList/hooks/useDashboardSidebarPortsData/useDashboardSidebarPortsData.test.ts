import { describe, expect, it } from "bun:test";
import type { PortChangedPayload } from "@superset/workspace-client";
import {
	applyPortEventsToHostPortsResult,
	deriveHostPortQueryTargets,
	groupDashboardSidebarPorts,
	type HostPortsResult,
} from "./useDashboardSidebarPortsData.utils";

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

describe("deriveHostPortQueryTargets", () => {
	it("groups workspace ids by host, sorts them, and resolves local/remote host urls", () => {
		const targets = deriveHostPortQueryTargets({
			activeHostUrl: "http://127.0.0.1:4567",
			hosts: [
				{
					organizationId: "org-1",
					machineId: "remote-machine",
					isOnline: true,
				},
				{
					organizationId: "org-1",
					machineId: "local-machine",
					isOnline: true,
				},
			],
			machineId: "local-machine",
			relayUrl: "https://relay.example.com",
			workspaces: [
				{
					id: "workspace-b",
					name: "Workspace B",
					hostId: "local-machine",
					hostMachineId: "local-machine",
				},
				{
					id: "workspace-a",
					name: "Workspace A",
					hostId: "local-machine",
					hostMachineId: "local-machine",
				},
				{
					id: "workspace-c",
					name: "Workspace C",
					hostId: "remote-machine",
					hostMachineId: "remote-machine",
				},
			],
		});

		expect(targets).toEqual([
			{
				machineId: "remote-machine",
				hostType: "remote-device",
				hostUrl: "https://relay.example.com/hosts/org-1:remote-machine",
				workspaceIds: ["workspace-c"],
			},
			{
				machineId: "local-machine",
				hostType: "local-device",
				hostUrl: "http://127.0.0.1:4567",
				workspaceIds: ["workspace-a", "workspace-b"],
			},
		]);
	});

	it("skips offline remote hosts and local hosts without an active URL", () => {
		const targets = deriveHostPortQueryTargets({
			activeHostUrl: null,
			hosts: [
				{
					organizationId: "org-1",
					machineId: "remote-machine",
					isOnline: false,
				},
				{
					organizationId: "org-1",
					machineId: "local-machine",
					isOnline: true,
				},
			],
			machineId: "local-machine",
			relayUrl: "https://relay.example.com",
			workspaces: [
				{
					id: "workspace-remote",
					name: "Remote",
					hostId: "remote-machine",
					hostMachineId: "remote-machine",
				},
				{
					id: "workspace-local",
					name: "Local",
					hostId: "local-machine",
					hostMachineId: "local-machine",
				},
			],
		});

		expect(targets).toEqual([]);
	});
});

describe("groupDashboardSidebarPorts", () => {
	it("groups ports by workspace and sorts workspaces and ports", () => {
		const groups = groupDashboardSidebarPorts({
			hostPortResults: [
				{
					hostId: "host-1",
					hostType: "local-device",
					hostUrl: "http://127.0.0.1:4567",
					ports: [
						{
							port: 5173,
							pid: 100,
							processName: "vite",
							terminalId: "terminal-1",
							workspaceId: "workspace-b",
							detectedAt: 1,
							address: "127.0.0.1",
							label: "Frontend",
						},
						{
							port: 3000,
							pid: 101,
							processName: "next",
							terminalId: "terminal-2",
							workspaceId: "workspace-b",
							detectedAt: 1,
							address: "127.0.0.1",
							label: "Web",
						},
						{
							port: 8080,
							pid: 102,
							processName: "api",
							terminalId: "terminal-3",
							workspaceId: "workspace-a",
							detectedAt: 1,
							address: "127.0.0.1",
							label: "API",
						},
					],
				},
			],
			machineId: "machine-1",
			workspaces: [
				{
					id: "workspace-b",
					name: "Beta",
					hostId: "host-1",
					hostMachineId: "machine-1",
				},
				{
					id: "workspace-a",
					name: "Alpha",
					hostId: "host-1",
					hostMachineId: "machine-1",
				},
			],
		});

		expect(groups.map((group) => group.workspaceName)).toEqual([
			"Alpha",
			"Beta",
		]);
		expect(groups[1]?.ports.map((port) => port.port)).toEqual([3000, 5173]);
		expect(groups[0]?.hostType).toBe("local-device");
	});

	it("drops ports whose workspace belongs to another host", () => {
		const groups = groupDashboardSidebarPorts({
			hostPortResults: [
				{
					hostId: "host-1",
					hostType: "remote-device",
					hostUrl: "https://relay.example.com/hosts/host-1",
					ports: [
						{
							port: 5173,
							pid: 100,
							processName: "vite",
							terminalId: "terminal-1",
							workspaceId: "workspace-1",
							detectedAt: 1,
							address: "127.0.0.1",
							label: "Frontend",
						},
					],
				},
			],
			machineId: "machine-1",
			workspaces: [
				{
					id: "workspace-1",
					name: "Workspace",
					hostId: "host-2",
					hostMachineId: "machine-2",
				},
			],
		});

		expect(groups).toEqual([]);
	});
});
