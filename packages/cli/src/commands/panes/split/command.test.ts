import { beforeEach, describe, expect, mock, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import command from "./command";

const layout = { activeTabId: null, tabs: [] };
let splitError: Error | null = null;

const createSession = mock(async () => ({ terminalId: "term-new" }));
const killSession = mock(async () => ({ success: true }));
const split = mock(async () => {
	if (splitError) throw splitError;
	return { paneId: "pane-new", tabId: "tab-1", layout };
});

withLocalHostService("org-1", {
	"terminal.createSession": createSession as never,
	"terminal.killSession": killSession as never,
	"panes.split": split as never,
});

function invoke(options: Record<string, unknown> = {}) {
	return command.run({
		ctx: { config: { organizationId: "org-1" }, bearer: "bearer" } as never,
		args: {} as never,
		options: {
			workspace: "ws-1",
			pane: "pane-1",
			direction: "right",
			...options,
		} as never,
		signal: new AbortController().signal,
	});
}

beforeEach(() => {
	splitError = null;
	createSession.mockClear();
	killSession.mockClear();
	split.mockClear();
});

describe("panes split", () => {
	test("creates a terminal and shows it in the new pane", async () => {
		const result = await invoke();
		expect(split).toHaveBeenLastCalledWith({
			workspaceId: "ws-1",
			paneId: "pane-1",
			direction: "right",
			terminalId: "term-new",
		});
		expect((result as { data: unknown }).data).toMatchObject({
			paneId: "pane-new",
			terminalId: "term-new",
		});
	});

	test("shows an existing terminal without creating one", async () => {
		await invoke({ terminal: "term-old" });
		expect(createSession).not.toHaveBeenCalled();
		expect(split).toHaveBeenLastCalledWith(
			expect.objectContaining({ terminalId: "term-old" }),
		);
	});

	test("kills the terminal it created when the split fails", async () => {
		splitError = new Error("No pane pane-1 in this workspace");
		await expect(invoke()).rejects.toThrow("No pane pane-1");
		expect(killSession).toHaveBeenLastCalledWith({
			workspaceId: "ws-1",
			terminalId: "term-new",
		});
	});

	test("names an old host instead of a missing procedure", async () => {
		splitError = new Error('No procedure found on path "panes.split"');
		await expect(invoke({ terminal: "term-old" })).rejects.toThrow(
			"This host is too old for `superset panes`",
		);
		expect(killSession).not.toHaveBeenCalled();
	});
});
