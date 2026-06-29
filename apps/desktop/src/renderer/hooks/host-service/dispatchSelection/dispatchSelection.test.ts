import { describe, expect, it, mock } from "bun:test";
import { dispatchSelection } from "./dispatchSelection";

const PROMPT = "In src/a.ts:L1-L2: do it\n```\nconst a = 1;\n```";

function makeDeps(overrides?: {
	sendToTerminalResolves?: boolean;
	createReturns?: { terminalId: string } | null;
}) {
	const sendToTerminalAgent = mock(async () => {
		if (overrides?.sendToTerminalResolves === false) {
			throw new Error("writeInput rejected");
		}
	});
	const createResult: { terminalId: string } | null =
		overrides && "createReturns" in overrides
			? (overrides.createReturns ?? null)
			: { terminalId: "new-term" };
	const onCreateNewAgentSession = mock(
		async (): Promise<{ terminalId: string } | null> => createResult,
	);
	const onMissingLauncher = mock(() => {});
	return { sendToTerminalAgent, onCreateNewAgentSession, onMissingLauncher };
}

describe("dispatchSelection — target resolution", () => {
	it("dispatches into the existing terminal via sendToTerminalAgent", async () => {
		const deps = makeDeps();

		const outcome = await dispatchSelection({
			workspaceId: "ws1",
			text: PROMPT,
			target: { kind: "existing", terminalId: "term-7" },
			...deps,
		});

		expect(outcome).toBe("sent");
		expect(deps.sendToTerminalAgent).toHaveBeenCalledTimes(1);
		expect(deps.sendToTerminalAgent).toHaveBeenCalledWith({
			workspaceId: "ws1",
			terminalId: "term-7",
			text: PROMPT,
		});
		expect(deps.onCreateNewAgentSession).not.toHaveBeenCalled();
	});

	it("launches a new session when the resolved target is {kind:'new'} (no live session)", async () => {
		const deps = makeDeps();

		const outcome = await dispatchSelection({
			workspaceId: "ws1",
			text: PROMPT,
			target: { kind: "new", configId: "cfg-1", placement: "split-pane" },
			...deps,
		});

		expect(outcome).toBe("sent");
		expect(deps.onCreateNewAgentSession).toHaveBeenCalledTimes(1);
		expect(deps.onCreateNewAgentSession).toHaveBeenCalledWith({
			configId: "cfg-1",
			placement: "split-pane",
			prompt: PROMPT,
		});
		expect(deps.sendToTerminalAgent).not.toHaveBeenCalled();
	});

	it("never silent-drops: a null target with no launcher signals the missing launcher", async () => {
		const deps = makeDeps();

		const outcome = await dispatchSelection({
			workspaceId: "ws1",
			text: PROMPT,
			target: null,
			sendToTerminalAgent: deps.sendToTerminalAgent,
			onCreateNewAgentSession: undefined,
			onMissingLauncher: deps.onMissingLauncher,
		});

		expect(outcome).toBe("no-launcher");
		expect(deps.onMissingLauncher).toHaveBeenCalledTimes(1);
		expect(deps.sendToTerminalAgent).not.toHaveBeenCalled();
	});

	it("signals the missing launcher when a new session is required but onCreateNewAgentSession is unwired", async () => {
		const deps = makeDeps();

		const outcome = await dispatchSelection({
			workspaceId: "ws1",
			text: PROMPT,
			target: { kind: "new", configId: "cfg-1", placement: "split-pane" },
			sendToTerminalAgent: deps.sendToTerminalAgent,
			onCreateNewAgentSession: undefined,
			onMissingLauncher: deps.onMissingLauncher,
		});

		expect(outcome).toBe("no-launcher");
		expect(deps.onMissingLauncher).toHaveBeenCalledTimes(1);
	});
});

describe("dispatchSelection — error handling", () => {
	it("returns 'failed' (does not throw) when the terminal write rejects, so the caller can keep state for retry", async () => {
		const deps = makeDeps({ sendToTerminalResolves: false });

		const outcome = await dispatchSelection({
			workspaceId: "ws1",
			text: PROMPT,
			target: { kind: "existing", terminalId: "term-7" },
			...deps,
		});

		expect(outcome).toBe("failed");
	});

	it("returns 'failed' when a new-session launch resolves null (launch did not start)", async () => {
		const deps = makeDeps({ createReturns: null });

		const outcome = await dispatchSelection({
			workspaceId: "ws1",
			text: PROMPT,
			target: { kind: "new", configId: "cfg-1", placement: "split-pane" },
			...deps,
		});

		expect(outcome).toBe("failed");
	});
});
