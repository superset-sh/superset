import { describe, expect, it, mock } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import { isTerminalReplacementCancelled } from "../../../../utils/cancelledTerminalReplacements";
import { replaceEndedTerminal } from "./replaceEndedTerminal";

function setup() {
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({
		id: "tab",
		panes: [
			{
				id: "pane",
				kind: "terminal",
				data: { terminalId: "old", createOnAttach: true },
			},
		],
	});
	let resolve!: (id: string) => void;
	let reject!: (error: Error) => void;
	const created = new Promise<string>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	const apply = mock((_id: string) => {});
	const input = {
		store,
		paneId: "pane",
		terminalId: "old",
		create: mock(() => created),
		dispose: mock(async (_id: string) => {}),
		prepare: mock(() => apply),
		apply,
	};
	return { input, resolve, reject };
}

describe("ended terminal replacement", () => {
	it("waits for success before changing the pane and drops createOnAttach", async () => {
		const { input, resolve } = setup();
		const result = replaceEndedTerminal(input);
		expect(input.prepare).toHaveBeenCalledTimes(1);
		expect(input.apply).not.toHaveBeenCalled();
		expect(input.store.getState().getPane("pane")?.pane.data).toEqual({
			terminalId: "old",
			createOnAttach: true,
		});
		resolve("new");
		await result;
		expect(input.store.getState().getPane("pane")?.pane.data).toEqual({
			terminalId: "new",
		});
		expect(input.apply).toHaveBeenCalledWith("new");
		expect(input.dispose).not.toHaveBeenCalled();
	});
	it("coalesces rapid repeat clicks", async () => {
		const { input, resolve } = setup();
		const first = replaceEndedTerminal(input);
		const second = replaceEndedTerminal(input);
		expect(input.create).toHaveBeenCalledTimes(1);
		resolve("new");
		await Promise.all([first, second]);
		expect(input.prepare).toHaveBeenCalledTimes(1);
	});
	it("keeps the old pane and allows retry after creation fails", async () => {
		const { input, reject } = setup();
		const result = replaceEndedTerminal(input);
		reject(new Error("offline"));
		await expect(result).rejects.toThrow("offline");
		expect(input.store.getState().getPane("pane")?.pane.data).toEqual({
			terminalId: "old",
			createOnAttach: true,
		});
		await replaceEndedTerminal({ ...input, create: async () => "retry" });
		expect(input.store.getState().getPane("pane")?.pane.data).toEqual({
			terminalId: "retry",
		});
	});
	for (const change of ["close", "sync", "repoint"] as const) {
		it(`disposes an unused replacement when the pane changes via ${change}`, async () => {
			const { input, resolve } = setup();
			const result = replaceEndedTerminal(input);
			if (change === "close")
				input.store.getState().closePane({ tabId: "tab", paneId: "pane" });
			if (change === "sync")
				input.store
					.getState()
					.replaceState({ version: 1, tabs: [], activeTabId: null });
			if (change === "repoint")
				input.store
					.getState()
					.setPaneData({ paneId: "pane", data: { terminalId: "resumed" } });
			resolve("unused");
			await result;
			expect(input.dispose).toHaveBeenCalledWith("unused");
			expect(input.apply).not.toHaveBeenCalled();
		});
	}
	it("removes a cancelled replacement adopted while creation or disposal was pending", async () => {
		const { input, resolve } = setup();
		const result = replaceEndedTerminal(input);
		input.store.getState().closePane({ tabId: "tab", paneId: "pane" });
		const closed = mock(() => {});
		input.store.getState().subscribePaneClose(closed);
		const adopt = (id: string) =>
			input.store.getState().addTab({
				id,
				panes: [{ id, kind: "terminal", data: { terminalId: "unused" } }],
			});
		adopt("adopted-before-response");
		input.dispose.mockImplementation(async () => {
			adopt("adopted-during-disposal");
		});
		resolve("unused");
		await result;
		expect(input.store.getState().tabs).toHaveLength(0);
		expect(input.dispose).toHaveBeenCalledTimes(1);
		expect(closed).not.toHaveBeenCalled();
	});
	it("never creates for a stale callback", async () => {
		const { input } = setup();
		input.store.getState().removeTab("tab");
		await replaceEndedTerminal(input);
		expect(input.create).not.toHaveBeenCalled();
	});
});

for (const failTwice of [false, true]) {
	it(`cleans adopted panes and suppresses late discovery when cancellation ${failTwice ? "stays offline" : "loses its first response"}`, async () => {
		const { input, resolve } = setup();
		const id = `cancelled-${failTwice}`;
		const result = replaceEndedTerminal(input);
		input.store.getState().removeTab("tab");
		input.store.getState().addTab({
			id: "adopted",
			panes: [{ id: "adopted", kind: "terminal", data: { terminalId: id } }],
		});
		let attempts = 0;
		input.dispose.mockImplementation(async () => {
			expect(isTerminalReplacementCancelled(id)).toBe(true);
			if (++attempts === 1 || failTwice) throw new Error("lost response");
		});
		resolve(id);
		if (failTwice) await expect(result).rejects.toThrow("lost response");
		else await result;
		expect(input.dispose).toHaveBeenCalledTimes(2);
		expect(input.store.getState().tabs).toHaveLength(0);
		expect(
			[id, "unrelated-session"].filter(
				(id) => !isTerminalReplacementCancelled(id),
			),
		).toEqual(["unrelated-session"]);
	});
}
