import { describe, expect, it } from "bun:test";
import type { PortForward } from "shared/types";
import type { DashboardSidebarPort } from "../../hooks/useDashboardSidebarPortsData";
import { formatPortRowLabel } from "./formatPortRowLabel";

const remote: DashboardSidebarPort = {
	port: 3000,
	pid: 1,
	processName: "node",
	terminalId: "t1",
	workspaceId: "ws",
	detectedAt: 0,
	address: "127.0.0.1",
	label: null,
	hostId: "h",
	hostType: "remote-device",
	hostUrl: "https://relay.superset.sh/hosts/org:m",
};

function forward(status: PortForward["status"]): PortForward {
	return {
		id: "x",
		target: { hostUrl: remote.hostUrl, workspaceId: "ws", remotePort: 3000 },
		status,
		transport: "relay",
		connections: 0,
	};
}

describe("formatPortRowLabel", () => {
	it("local port", () => {
		expect(
			formatPortRowLabel({
				port: { ...remote, hostType: "local-device" },
				forward: null,
			}),
		).toEqual({ text: "localhost:3000" });
	});
	it("remote, not forwarded", () => {
		expect(formatPortRowLabel({ port: remote, forward: null })).toEqual({
			text: "3000 · remote",
		});
	});
	it("remote, forwarded to the same port", () => {
		expect(
			formatPortRowLabel({
				port: remote,
				forward: forward({ state: "active", localPort: 3000 }),
			}),
		).toEqual({ text: "3000 · forwarded" });
	});
	it("remote, forwarded to another port", () => {
		expect(
			formatPortRowLabel({
				port: remote,
				forward: forward({ state: "active", localPort: 54321 }),
			}),
		).toEqual({ text: "3000 → localhost:54321" });
	});
	it("remote, busy", () => {
		expect(
			formatPortRowLabel({
				port: remote,
				forward: forward({ state: "busy", localPort: 3000, localOwner: null }),
			}),
		).toEqual({ text: "3000 · local port busy" });
	});
	it("remote, error", () => {
		expect(
			formatPortRowLabel({
				port: remote,
				forward: forward({ state: "error", message: "Host is offline" }),
			}),
		).toEqual({ text: "3000 · Host is offline", title: "Host is offline" });
	});
});
