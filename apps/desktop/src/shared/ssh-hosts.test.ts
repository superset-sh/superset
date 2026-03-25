import { describe, expect, it } from "bun:test";
import {
	getDefaultSshHostRemoteRootDir,
	getSshHostDeviceClientId,
	getSshHostIdFromDeviceClientId,
	getSshHostRemotePort,
	getSshHostServiceSessionName,
	getSshTerminalSessionName,
	isSshHostDeviceClientId,
	resolveSshHostRemoteRootDir,
} from "./ssh-hosts";

describe("ssh-host helpers", () => {
	it("round-trips SSH host device identifiers", () => {
		const deviceClientId = getSshHostDeviceClientId("homebox");

		expect(deviceClientId).toBe("ssh-host:homebox");
		expect(isSshHostDeviceClientId(deviceClientId)).toBe(true);
		expect(getSshHostIdFromDeviceClientId(deviceClientId)).toBe("homebox");
		expect(getSshHostIdFromDeviceClientId("device-123")).toBeNull();
	});

	it("resolves remote root directories with a default fallback", () => {
		expect(getDefaultSshHostRemoteRootDir("homebox")).toBe(
			"~/.superset/ssh-hosts/homebox",
		);
		expect(resolveSshHostRemoteRootDir("homebox", "  /srv/superset  ")).toBe(
			"/srv/superset",
		);
		expect(resolveSshHostRemoteRootDir("homebox", "")).toBe(
			"~/.superset/ssh-hosts/homebox",
		);
	});

	it("derives stable ports and tmux session names", () => {
		expect(
			getSshHostRemotePort("11111111-1111-1111-1111-111111111111", "homebox"),
		).toBe(
			getSshHostRemotePort("11111111-1111-1111-1111-111111111111", "homebox"),
		);
		expect(
			getSshHostServiceSessionName(
				"11111111-1111-1111-1111-111111111111",
				"Home Box",
			),
		).toBe("superset-host-home-box-11111111-1111-1111-1111-");
		expect(getSshTerminalSessionName("workspace:123")).toBe(
			"superset-workspace-workspace-123",
		);
	});
});
