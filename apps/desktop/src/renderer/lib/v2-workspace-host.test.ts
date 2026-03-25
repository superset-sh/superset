import { describe, expect, it } from "bun:test";
import type { SshHostConnectionStatus } from "shared/ssh-hosts";
import {
	getCloudWorkspaceHostUrl,
	getWorkspaceHostUrlForDevice,
	getWorkspaceHostUrlForWorkspace,
	resolveCreateWorkspaceHostUrl,
	resolveWorkspaceHostUrl,
	resolveWorkspaceSshHostId,
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

function createSshStatus(
	hostId: string,
	options?: {
		deviceClientId?: string | null;
		hostUrl?: string | null;
	},
): SshHostConnectionStatus {
	return {
		diagnostic: null,
		health:
			options?.deviceClientId === undefined
				? null
				: {
						deviceClientId: options.deviceClientId,
						deviceName: "Remote SSH Host",
						hasModelProviderCredentials: true,
						status: "ok",
						terminalMode: "pty",
					},
		hostId,
		hostUrl: options?.hostUrl ?? null,
		lastError: null,
		localPort: options?.hostUrl ? 41001 : null,
		missingPrerequisites: [],
		organizationId: "org-1",
		remotePort: 39001,
		sshTarget: "dev@example",
		state: options?.hostUrl ? "ready" : "starting",
		updatedAt: 0,
	};
}

describe("resolveWorkspaceSshHostId", () => {
	it("prefers the persisted ssh host id for v2 ssh workspaces", () => {
		expect(
			resolveWorkspaceSshHostId({
				workspaceDeviceClientId: "remote-device",
				workspaceSshHostId: "ssh-host-1",
				sshStatuses: new Map(),
			}),
		).toBe("ssh-host-1");
	});

	it("falls back to the ssh host device prefix for legacy ssh workspaces", () => {
		expect(
			resolveWorkspaceSshHostId({
				workspaceDeviceClientId: "ssh-host:ssh-host-legacy",
				sshStatuses: new Map(),
			}),
		).toBe("ssh-host-legacy");
	});

	it("matches the forwarded ssh tunnel by remote device identity", () => {
		const sshStatuses = new Map([
			[
				"ssh-host-1",
				createSshStatus("ssh-host-1", {
					deviceClientId: "remote-device-1",
					hostUrl: "http://127.0.0.1:41001",
				}),
			],
		]);

		expect(
			resolveWorkspaceSshHostId({
				workspaceDeviceClientId: "remote-device-1",
				sshStatuses,
			}),
		).toBe("ssh-host-1");
	});
});

describe("resolveWorkspaceHostUrl", () => {
	it("returns the local host url for the current device", () => {
		expect(
			resolveWorkspaceHostUrl({
				currentDeviceClientId: "device-local",
				localHostUrl: "http://127.0.0.1:4000",
				workspaceDeviceClientId: "device-local",
				workspaceId: "workspace-1",
			}),
		).toBe("http://127.0.0.1:4000");
	});

	it("returns the forwarded ssh host url for persisted ssh workspaces", () => {
		const sshStatuses = new Map([
			[
				"ssh-host-1",
				createSshStatus("ssh-host-1", {
					deviceClientId: "remote-device-1",
					hostUrl: "http://127.0.0.1:41001",
				}),
			],
		]);

		expect(
			resolveWorkspaceHostUrl({
				currentDeviceClientId: "device-local",
				localHostUrl: "http://127.0.0.1:4000",
				sshStatuses,
				workspaceDeviceClientId: "remote-device-1",
				workspaceId: "workspace-1",
				workspaceSshHostId: "ssh-host-1",
			}),
		).toBe("http://127.0.0.1:41001");
	});

	it("returns the forwarded ssh host url when the remote device matches a live ssh tunnel", () => {
		const sshStatuses = new Map([
			[
				"ssh-host-1",
				createSshStatus("ssh-host-1", {
					deviceClientId: "remote-device-1",
					hostUrl: "http://127.0.0.1:41001",
				}),
			],
		]);

		expect(
			resolveWorkspaceHostUrl({
				currentDeviceClientId: "device-local",
				localHostUrl: "http://127.0.0.1:4000",
				sshStatuses,
				workspaceDeviceClientId: "remote-device-1",
				workspaceId: "workspace-1",
			}),
		).toBe("http://127.0.0.1:41001");
	});

	it("falls back to the shared v2 workspace host endpoint for cloud and device workspaces", () => {
		expect(
			resolveWorkspaceHostUrl({
				currentDeviceClientId: "device-local",
				localHostUrl: "http://127.0.0.1:4000",
				workspaceDeviceClientId: "remote-device-2",
				workspaceId: "workspace-1",
			}),
		).toBe(getWorkspaceHostUrlForWorkspace("workspace-1"));
	});

	it("returns null when an ssh workspace is known but not connected yet", () => {
		expect(
			resolveWorkspaceHostUrl({
				currentDeviceClientId: "device-local",
				localHostUrl: "http://127.0.0.1:4000",
				sshStatuses: new Map([
					["ssh-host-1", createSshStatus("ssh-host-1", { hostUrl: null })],
				]),
				workspaceDeviceClientId: "remote-device-1",
				workspaceId: "workspace-1",
				workspaceSshHostId: "ssh-host-1",
			}),
		).toBeNull();
	});
});
