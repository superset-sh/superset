import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface Candidate {
	terminalId: string;
	workspaceId: string;
	agentLabel: string;
	managed: boolean;
}

let candidates: Candidate[] = [];
const queryCandidates = mock(() => Promise.resolve(candidates));

// Spread the real module: `mock.module` is process-wide, so a partial stub
// would strip the other exports from every suite in the same run.
// Snapshot into a plain object: `mock.module` rewrites the live namespace in
// place, so spreading the namespace itself in `afterAll` would restore the stub.
const realHostServiceClient = {
	...(await import("renderer/lib/host-service-client")),
};
mock.module("renderer/lib/host-service-client", () => ({
	...realHostServiceClient,
	getHostServiceClientByUrl: () => ({
		terminalAgents: {
			accountRestartCandidates: { query: queryCandidates },
		},
	}),
}));

const { cleanup, renderHook } = await import("@testing-library/react");
const { usePinnedAgentSessions } = await import("./usePinnedAgentSessions");

afterEach(cleanup);
afterAll(async () => {
	// `mock.module` is process-wide and `mock.restore` does not undo it, so the
	// real module goes back before the next suite in this run asks for a client.
	mock.module("renderer/lib/host-service-client", () => ({
		...realHostServiceClient,
	}));
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const HOST = "http://127.0.0.1:7777";

function setup(hostUrl: string | null = HOST) {
	return renderHook(() => usePinnedAgentSessions(hostUrl));
}

describe("usePinnedAgentSessions", () => {
	// KTD12: a managed session is hot-swapped in place, so it is never part of
	// the number the notice reports as left behind.
	test("counts only the sessions pinned to their own config dir", async () => {
		candidates = [
			{
				terminalId: "t-managed",
				workspaceId: "w-1",
				agentLabel: "Claude Code",
				managed: true,
			},
			{
				terminalId: "t-pinned",
				workspaceId: "w-2",
				agentLabel: "Claude Code",
				managed: false,
			},
			{
				terminalId: "t-pinned-2",
				workspaceId: "w-3",
				agentLabel: "Claude Code",
				managed: false,
			},
		];
		const view = setup();

		const count = await view.result.current.countPinnedSessions("claude");

		expect(count).toBe(2);
		expect(queryCandidates).toHaveBeenCalledWith({ provider: "claude" });
	});

	test("asks for nothing when there is no host", async () => {
		queryCandidates.mockClear();
		const view = setup(null);

		expect(await view.result.current.countPinnedSessions("codex")).toBe(0);
		expect(queryCandidates).not.toHaveBeenCalled();
	});
});
