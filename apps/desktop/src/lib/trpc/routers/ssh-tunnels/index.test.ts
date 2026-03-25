import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { SshHostConnectionStatus } from "shared/ssh-hosts";

function makeStatus(
	hostId: string,
	state: SshHostConnectionStatus["state"],
): SshHostConnectionStatus {
	return {
		diagnostic: null,
		health: null,
		hostId,
		hostUrl: state === "ready" ? "http://127.0.0.1:4010" : null,
		lastError: state === "error" ? "connect failed" : null,
		localPort: state === "ready" ? 4010 : null,
		missingPrerequisites: [],
		organizationId: null,
		remotePort: state === "ready" ? 39123 : null,
		sshTarget: "dev@homebox",
		state,
		updatedAt: 1,
	};
}

const probeMock = mock(async (hostId: string) => makeStatus(hostId, "idle"));
const connectMock = mock(async (hostId: string) => makeStatus(hostId, "ready"));
const healthcheckMock = mock(async (hostId: string) =>
	makeStatus(hostId, "ready"),
);
const disconnectMock = mock(async () => {});
const getStatusMock = mock((hostId: string) => makeStatus(hostId, "error"));

let createSshTunnelsRouter: typeof import("./index").createSshTunnelsRouter;

describe("createSshTunnelsRouter", () => {
	beforeAll(async () => {
		mock.module("main/lib/ssh-hosts/manager", () => ({
			getSshHostServiceManager: () => ({
				connect: connectMock,
				disconnect: disconnectMock,
				getStatus: getStatusMock,
				healthcheck: healthcheckMock,
				probe: probeMock,
			}),
		}));

		({ createSshTunnelsRouter } = await import("./index"));
	});

	beforeEach(() => {
		probeMock.mockClear();
		connectMock.mockClear();
		healthcheckMock.mockClear();
		disconnectMock.mockClear();
		getStatusMock.mockClear();
	});

	it("routes probe, connect, status, healthcheck, and disconnect through the shared manager", async () => {
		const caller = createSshTunnelsRouter().createCaller({});

		const probeResult = await caller.probe({ hostId: "ssh-host-1" });
		expect(probeMock).toHaveBeenCalledWith("ssh-host-1");
		expect(probeResult.status.state).toBe("idle");

		const connectResult = await caller.connect({ hostId: "ssh-host-1" });
		expect(connectMock).toHaveBeenCalledWith("ssh-host-1");
		expect(connectResult.status.state).toBe("ready");

		const statusResult = await caller.status({ hostId: "ssh-host-1" });
		expect(getStatusMock).toHaveBeenCalledWith("ssh-host-1");
		expect(statusResult.status.state).toBe("error");

		const healthResult = await caller.healthcheck({ hostId: "ssh-host-1" });
		expect(healthcheckMock).toHaveBeenCalledWith("ssh-host-1");
		expect(healthResult.status.state).toBe("ready");

		const disconnectResult = await caller.disconnect({ hostId: "ssh-host-1" });
		expect(disconnectMock).toHaveBeenCalledWith("ssh-host-1");
		expect(getStatusMock).toHaveBeenCalledWith("ssh-host-1");
		expect(disconnectResult.status.state).toBe("error");
	});
});
