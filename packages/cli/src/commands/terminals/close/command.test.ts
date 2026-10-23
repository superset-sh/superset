import { beforeEach, describe, expect, mock, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import command from "./command";

type Pane = { id: string; terminalId: string | null };

let panes: Pane[] = [];
let listError: Error | null = null;
let failingPaneIds = new Set<string>();
let switchedPaneIds = new Set<string>();
/** Terminal an old host (no `expectedTerminalId`) found in the pane when it closed it. */
let oldHostClosedTerminalId: string | null | undefined;
const calls: string[] = [];

function codedError(message: string, code: string): Error {
	return Object.assign(new Error(message), { code });
}

const list = mock(async () => {
	calls.push("panes.list");
	if (listError) throw listError;
	return {
		layout: { activeTabId: "tab-1", tabs: [{ id: "tab-1", panes }] },
	};
});
const close = mock(async (input: Record<string, unknown>) => {
	calls.push(`panes.close ${input.paneId}`);
	if (failingPaneIds.has(input.paneId as string)) {
		throw codedError(`No pane ${input.paneId} in this workspace`, "NOT_FOUND");
	}
	if (oldHostClosedTerminalId !== undefined) {
		return {
			layout: { activeTabId: null, tabs: [] },
			terminalId: oldHostClosedTerminalId,
		};
	}
	if (switchedPaneIds.has(input.paneId as string)) {
		throw codedError(
			`Pane ${input.paneId} no longer shows terminal ${input.expectedTerminalId}`,
			"CONFLICT",
		);
	}
	return {
		layout: { activeTabId: null, tabs: [] },
		terminalId: input.expectedTerminalId,
	};
});
const killSession = mock(async (input: Record<string, unknown>) => {
	calls.push("terminal.killSession");
	return { terminalId: input.terminalId, status: "disposed" };
});

withLocalHostService("org-1", {
	"workspace.list": () => [{ id: "ws-1" }],
	"panes.list": list as never,
	"panes.close": close as never,
	"terminal.killSession": killSession as never,
});

async function invoke(options: Record<string, unknown> = {}) {
	const result = await command.run({
		ctx: { config: { organizationId: "org-1" }, bearer: "bearer" } as never,
		args: {} as never,
		options: {
			workspace: "ws-1",
			terminal: "term-1",
			local: true,
			...options,
		} as never,
		signal: new AbortController().signal,
	});
	return result as { data: Record<string, unknown>; message: string };
}

beforeEach(() => {
	panes = [];
	listError = null;
	failingPaneIds = new Set();
	switchedPaneIds = new Set();
	oldHostClosedTerminalId = undefined;
	calls.length = 0;
	list.mockClear();
	close.mockClear();
	killSession.mockClear();
});

describe("terminals close", () => {
	test("without --remove-pane only kills the terminal", async () => {
		panes = [{ id: "pane-1", terminalId: "term-1" }];
		const result = await invoke();
		expect(calls).toEqual(["terminal.killSession"]);
		expect(result.data).toEqual({ terminalId: "term-1", status: "disposed" });
		expect(result.message).toBe("Closed terminal term-1");
	});

	test("closes the pane showing the terminal, keeping it, then kills it once", async () => {
		panes = [
			{ id: "pane-1", terminalId: "term-1" },
			{ id: "pane-2", terminalId: "term-2" },
		];
		const result = await invoke({ removePane: true });
		expect(calls).toEqual([
			"panes.list",
			"panes.close pane-1",
			"terminal.killSession",
		]);
		expect(close).toHaveBeenLastCalledWith({
			workspaceId: "ws-1",
			paneId: "pane-1",
			keepTerminal: true,
			expectedTerminalId: "term-1",
		});
		expect(result.data).toEqual({
			terminalId: "term-1",
			status: "disposed",
			removedPaneIds: ["pane-1"],
			skippedPanes: [],
			failedPanes: [],
			closedOtherTerminalPanes: [],
			paneRemovalSkippedReason: null,
		});
		expect(result.message).toBe(
			"Closed terminal term-1 and removed pane pane-1",
		);
	});

	test("closes every pane that shows the terminal", async () => {
		panes = [
			{ id: "pane-1", terminalId: "term-1" },
			{ id: "pane-2", terminalId: "term-1" },
		];
		const result = await invoke({ removePane: true });
		expect(calls).toEqual([
			"panes.list",
			"panes.close pane-1",
			"panes.close pane-2",
			"terminal.killSession",
		]);
		expect(result.data.removedPaneIds).toEqual(["pane-1", "pane-2"]);
		expect(result.message).toBe(
			"Closed terminal term-1 and removed panes pane-1, pane-2",
		);
	});

	test("kills the terminal when no pane shows it", async () => {
		panes = [{ id: "pane-2", terminalId: "term-2" }];
		const result = await invoke({ removePane: true });
		expect(calls).toEqual(["panes.list", "terminal.killSession"]);
		expect(result.data).toMatchObject({
			status: "disposed",
			removedPaneIds: [],
			paneRemovalSkippedReason: null,
		});
		expect(result.message).toBe("Closed terminal term-1; no pane showed it");
	});

	test("kills the terminal on a host too old for panes", async () => {
		listError = new Error('No procedure found on path "panes.list"');
		const result = await invoke({ removePane: true });
		expect(calls).toEqual(["panes.list", "terminal.killSession"]);
		expect(result.data).toMatchObject({
			status: "disposed",
			removedPaneIds: [],
			paneRemovalSkippedReason: "This host is too old for `superset panes`",
		});
		expect(result.message).toContain("panes not removed");
	});

	test("kills the terminal when no desktop app can edit the layout", async () => {
		listError = codedError(
			"This host has no pane layout to edit (no desktop app is attached to it).",
			"PRECONDITION_FAILED",
		);
		const result = await invoke({ removePane: true });
		expect(calls).toEqual(["panes.list", "terminal.killSession"]);
		expect(result.data.paneRemovalSkippedReason).toBe(
			"This host has no pane layout to edit (no desktop app is attached to it).",
		);
	});

	test("reports a pane it could not close and still kills the terminal", async () => {
		panes = [
			{ id: "pane-1", terminalId: "term-1" },
			{ id: "pane-2", terminalId: "term-1" },
		];
		failingPaneIds = new Set(["pane-1"]);
		const result = await invoke({ removePane: true });
		expect(calls).toEqual([
			"panes.list",
			"panes.close pane-1",
			"panes.close pane-2",
			"terminal.killSession",
		]);
		expect(result.data).toMatchObject({
			status: "disposed",
			removedPaneIds: ["pane-2"],
			failedPanes: [
				{ paneId: "pane-1", error: "No pane pane-1 in this workspace" },
			],
		});
		expect(result.message).toBe(
			"Closed terminal term-1 and removed pane pane-2\nWarning: could not close pane pane-1: No pane pane-1 in this workspace",
		);
	});

	test("leaves a pane open that switched to another terminal after the list", async () => {
		panes = [
			{ id: "pane-1", terminalId: "term-1" },
			{ id: "pane-2", terminalId: "term-1" },
		];
		switchedPaneIds = new Set(["pane-1"]);
		const result = await invoke({ removePane: true });
		expect(calls).toEqual([
			"panes.list",
			"panes.close pane-1",
			"panes.close pane-2",
			"terminal.killSession",
		]);
		expect(result.data).toMatchObject({
			status: "disposed",
			removedPaneIds: ["pane-2"],
			skippedPanes: [
				{
					paneId: "pane-1",
					reason: "Pane pane-1 no longer shows terminal term-1",
				},
			],
			failedPanes: [],
		});
		expect(result.message).toBe(
			"Closed terminal term-1 and removed pane pane-2\nLeft pane pane-1 open: Pane pane-1 no longer shows terminal term-1",
		);
	});

	test("reports a pane an old host closed after it switched to another terminal", async () => {
		panes = [{ id: "pane-1", terminalId: "term-1" }];
		oldHostClosedTerminalId = "term-2";
		const result = await invoke({ removePane: true });
		expect(calls).toEqual([
			"panes.list",
			"panes.close pane-1",
			"terminal.killSession",
		]);
		expect(result.data).toMatchObject({
			status: "disposed",
			removedPaneIds: [],
			closedOtherTerminalPanes: [{ paneId: "pane-1", terminalId: "term-2" }],
		});
		expect(result.message).toBe(
			"Closed terminal term-1\nWarning: closed pane pane-1 while it showed terminal term-2, not term-1 (the host is too old to check first); term-2 keeps running in the background",
		);
	});

	test("keeps the terminal and fails when the layout cannot be read", async () => {
		listError = codedError("Workspace not found", "NOT_FOUND");
		await expect(invoke({ removePane: true })).rejects.toThrow(
			"Workspace not found",
		);
		expect(killSession).not.toHaveBeenCalled();
	});
});
