import { beforeEach, describe, expect, it, mock } from "bun:test";

const resolveLaunchCommand = mock(async () => ({
	command: "'claude'",
	label: "Claude",
}));

mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({
		agents: {
			resolveLaunchCommand: {
				mutate: resolveLaunchCommand,
			},
		},
	}),
}));

const { resolveLinkedPresetLaunchCommand } = await import(
	"./resolveLinkedPresetLaunch"
);

describe("resolveLinkedPresetLaunchCommand", () => {
	beforeEach(() => {
		resolveLaunchCommand.mockClear();
		resolveLaunchCommand.mockResolvedValue({
			command: "'claude' '--dangerously-skip-permissions'",
			label: "Claude",
		});
	});

	it("asks the workspace host for a validated launch command", async () => {
		await expect(
			resolveLinkedPresetLaunchCommand({
				hostUrl: "http://workspace-host",
				agentId: "cfg-claude",
			}),
		).resolves.toBe("'claude' '--dangerously-skip-permissions'");
		expect(resolveLaunchCommand).toHaveBeenCalledWith({
			agent: "cfg-claude",
		});
	});

	it("fails closed when the workspace host is missing", async () => {
		await expect(
			resolveLinkedPresetLaunchCommand({
				hostUrl: null,
				agentId: "cfg-claude",
			}),
		).rejects.toThrow("Workspace host is not ready");
		expect(resolveLaunchCommand).not.toHaveBeenCalled();
	});
});
