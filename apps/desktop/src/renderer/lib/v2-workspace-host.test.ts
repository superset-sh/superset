import { describe, expect, it } from "bun:test";
import {
	getCloudWorkspaceHostUrl,
	getWorkspaceHostUrlForDevice,
	resolveCreateWorkspaceHostUrl,
} from "./v2-workspace-host";

describe("resolveCreateWorkspaceHostUrl", () => {
	it("returns the expected endpoint for each supported host target", () => {
		const sshHostUrls = new Map([["ssh-host-1", "http://127.0.0.1:41001"]]);

		expect(
			resolveCreateWorkspaceHostUrl(
				{ kind: "local" },
				"http://127.0.0.1:4000",
				sshHostUrls,
			),
		).toBe("http://127.0.0.1:4000");
		expect(
			resolveCreateWorkspaceHostUrl({ kind: "cloud" }, null, sshHostUrls),
		).toBe(getCloudWorkspaceHostUrl());
		expect(
			resolveCreateWorkspaceHostUrl(
				{ kind: "device", deviceId: "device-1" },
				null,
				sshHostUrls,
			),
		).toBe(getWorkspaceHostUrlForDevice("device-1"));
		expect(
			resolveCreateWorkspaceHostUrl(
				{ kind: "ssh", hostId: "ssh-host-1" },
				null,
				sshHostUrls,
			),
		).toBe("http://127.0.0.1:41001");
	});

	it("returns null when the selected SSH host is not connected yet", () => {
		expect(
			resolveCreateWorkspaceHostUrl(
				{ kind: "ssh", hostId: "missing-host" },
				null,
				new Map(),
			),
		).toBeNull();
	});
});
