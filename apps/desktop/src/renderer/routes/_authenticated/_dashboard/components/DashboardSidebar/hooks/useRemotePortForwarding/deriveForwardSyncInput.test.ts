import { describe, expect, it } from "bun:test";
import type {
	DashboardSidebarPort,
	DashboardSidebarPortGroup,
} from "../useDashboardSidebarPortsData";
import { deriveForwardSyncInput } from "./deriveForwardSyncInput";

const REMOTE_HOST = "https://relay.superset.sh/hosts/org:machine";

function port(
	overrides: Partial<DashboardSidebarPort> & { port: number },
): DashboardSidebarPort {
	return {
		pid: 1,
		processName: "node",
		terminalId: "t1",
		workspaceId: "ws-remote",
		detectedAt: 0,
		address: "127.0.0.1",
		label: null,
		hostId: "host-remote",
		hostType: "remote-device",
		hostUrl: REMOTE_HOST,
		...overrides,
	};
}

const groups: DashboardSidebarPortGroup[] = [
	{
		workspaceId: "ws-remote",
		workspaceName: "remote",
		hostType: "remote-device",
		ports: [
			port({ port: 5173 }),
			port({ port: 3000 }),
			port({ port: 3000, terminalId: "t2" }),
		],
	},
	{
		workspaceId: "ws-local",
		workspaceName: "local",
		hostType: "local-device",
		ports: [
			port({
				port: 3000,
				workspaceId: "ws-local",
				hostId: "host-local",
				hostType: "local-device",
				hostUrl: "http://localhost:4567",
			}),
		],
	},
];

describe("deriveForwardSyncInput", () => {
	it("forwards the remote ports of the selected workspace, sorted and deduped", () => {
		expect(
			deriveForwardSyncInput({ activeWorkspaceId: "ws-remote", groups }),
		).toEqual({
			hostUrl: REMOTE_HOST,
			workspaceId: "ws-remote",
			ports: [3000, 5173],
		});
	});

	it("forwards nothing for a local workspace", () => {
		expect(
			deriveForwardSyncInput({ activeWorkspaceId: "ws-local", groups }),
		).toEqual({ hostUrl: "", workspaceId: "", ports: [] });
	});

	it("forwards nothing when no workspace is selected", () => {
		expect(deriveForwardSyncInput({ activeWorkspaceId: null, groups })).toEqual(
			{ hostUrl: "", workspaceId: "", ports: [] },
		);
	});

	it("forwards nothing for a remote workspace without ports", () => {
		expect(
			deriveForwardSyncInput({ activeWorkspaceId: "ws-other", groups }),
		).toEqual({ hostUrl: "", workspaceId: "", ports: [] });
	});
});
