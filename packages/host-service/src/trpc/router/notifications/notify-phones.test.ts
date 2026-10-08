import { describe, expect, it, mock } from "bun:test";
import type { HostServiceContext } from "../../../types";
import { notifyPhones } from "./notify-phones";

function createContext(sent: number) {
	const mutate = mock((_input: unknown) => Promise.resolve({ sent }));
	const ctx = {
		db: {
			query: {
				workspaces: {
					findFirst: () => ({ sync: () => ({ name: "my-workspace" }) }),
				},
			},
		},
		api: { push: { notifyAgentEvent: { mutate } } },
	} as unknown as HostServiceContext;
	return { ctx, mutate };
}

const stop = {
	workspaceId: "workspace-1",
	terminalId: "terminal-1",
	eventType: "Stop" as const,
	preview: "All tests pass.",
	occurredAt: 1_000,
};

describe("notifyPhones", () => {
	it("sends the event with the workspace name", () => {
		const { ctx, mutate } = createContext(1);

		notifyPhones(ctx, stop);

		expect(mutate.mock.calls[0]?.[0]).toEqual({
			event: "stop",
			workspaceId: "workspace-1",
			terminalId: "terminal-1",
			workspaceName: "my-workspace",
			preview: "All tests pass.",
		});
	});

	it("stops calling for ten minutes after the API reports no devices", async () => {
		const { ctx, mutate } = createContext(0);

		notifyPhones(ctx, stop);
		await Promise.resolve();
		notifyPhones(ctx, { ...stop, occurredAt: stop.occurredAt + 60_000 });
		notifyPhones(ctx, { ...stop, occurredAt: stop.occurredAt + 600_001 });

		expect(mutate).toHaveBeenCalledTimes(2);
	});
});
