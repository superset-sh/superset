import { beforeEach, describe, expect, it, mock } from "bun:test";
import { killPortTarget } from "./killPortTarget";

const remoteKillMock = mock(async () => ({ success: true }));
const remoteClientUrls: string[] = [];
const getRemoteClient = (hostUrl: string) => {
	remoteClientUrls.push(hostUrl);
	return { ports: { kill: { mutate: remoteKillMock } } };
};

describe("killPortTarget", () => {
	beforeEach(() => {
		remoteKillMock.mockClear();
		remoteClientUrls.length = 0;
		remoteKillMock.mockResolvedValue({ success: true });
	});

	it("routes host-owned ports through the host-service client", async () => {
		const result = await killPortTarget(
			{
				workspaceId: "workspace-1",
				terminalId: "terminal-1",
				port: 5173,
				hostUrl: "http://host-service",
			},
			undefined,
			getRemoteClient,
		);

		expect(result).toEqual({ success: true });
		expect(remoteClientUrls).toEqual(["http://host-service"]);
		expect(remoteKillMock).toHaveBeenCalledWith({
			workspaceId: "workspace-1",
			terminalId: "terminal-1",
			port: 5173,
		});
	});

	it("routes local ports through the provided local kill function", async () => {
		const localKill = mock(async () => ({ success: true }));

		const result = await killPortTarget(
			{
				workspaceId: "workspace-1",
				terminalId: "terminal-1",
				port: 3000,
				hostUrl: null,
			},
			localKill,
		);

		expect(result).toEqual({ success: true });
		expect(localKill).toHaveBeenCalledWith({
			workspaceId: "workspace-1",
			terminalId: "terminal-1",
			port: 3000,
		});
	});

	it("normalizes thrown kill errors into failed results", async () => {
		const result = await killPortTarget(
			{
				workspaceId: "workspace-1",
				terminalId: "terminal-1",
				port: 3000,
			},
			async () => {
				throw new Error("network down");
			},
		);

		expect(result).toEqual({ success: false, error: "network down" });
	});
});
