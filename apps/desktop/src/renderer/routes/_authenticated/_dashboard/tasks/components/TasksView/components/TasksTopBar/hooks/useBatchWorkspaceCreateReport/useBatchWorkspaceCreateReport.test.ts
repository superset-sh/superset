import { afterAll, afterEach, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { SubmitOutcome } from "renderer/stores/workspace-creates";

// happy-dom over the preloaded plain-object document. Process-wide, so this
// unregisters in afterAll to leave the other renderer suites their document.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, renderHook } = await import("@testing-library/react");
const { useBatchWorkspaceCreateReport } = await import(
	"./useBatchWorkspaceCreateReport"
);

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function report(outcomes: SubmitOutcome[]): string | null {
	const { result } = renderHook(() => useBatchWorkspaceCreateReport());
	return result.current(outcomes);
}

describe("useBatchWorkspaceCreateReport", () => {
	it("says nothing when every workspace was created with its agent", () => {
		expect(report([{ ok: true, workspaceId: "ws-1" }])).toBeNull();
	});

	it("closes the first sentence when a batch fails both ways at once", () => {
		expect(
			report([
				{ ok: false, error: "Host service is not running" },
				{ ok: false, error: "Host service is not running" },
				{
					ok: false,
					workspaceId: "ws-1",
					error: "Agent launch failed: spawn claude ENOENT",
				},
			]),
		).toBe(
			"Couldn't create 2 workspaces: Host service is not running. " +
				"The agent didn't start in 1 workspace: Agent launch failed: spawn claude ENOENT",
		);
	});

	it("does not double the period when the host error closed itself", () => {
		expect(
			report([
				{ ok: false, error: "Host service is not running." },
				{ ok: false, workspaceId: "ws-1", error: "Agent launch failed." },
			]),
		).toBe(
			"Couldn't create 1 workspace: Host service is not running. " +
				"The agent didn't start in 1 workspace: Agent launch failed.",
		);
	});

	it("leaves a single failure kind exactly as it read before", () => {
		expect(report([{ ok: false, error: "Host service is not running" }])).toBe(
			"Couldn't create 1 workspace: Host service is not running",
		);
	});
});
