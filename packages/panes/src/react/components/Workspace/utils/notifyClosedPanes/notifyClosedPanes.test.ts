import { expect, mock, spyOn, test } from "bun:test";
import { createWorkspaceStore } from "../../../../../core/store/store";
import { notifyClosedPanes } from "./notifyClosedPanes";

test("tab close invokes every callback even when the first fails", () => {
	const store = createWorkspaceStore();
	store.getState().addTab({
		id: "tab",
		panes: [
			{ id: "first", kind: "broken", data: {} },
			{ id: "second", kind: "terminal", data: {} },
		],
	});
	const broken = mock(() => {
		throw new Error("cleanup failed");
	});
	const next = mock((_pane: unknown, _panes: readonly unknown[]) => {});
	const log = spyOn(console, "error").mockImplementation(() => {});
	const registry = {
		broken: { label: "Broken", renderPane: () => null, onAfterClose: broken },
		terminal: { label: "Terminal", renderPane: () => null, onAfterClose: next },
	};
	const unsubscribe = store
		.getState()
		.subscribePaneClose((panes) => notifyClosedPanes(panes, registry));
	try {
		store.getState().removeTab("tab");
		expect(broken).toHaveBeenCalledTimes(1);
		expect(next).toHaveBeenCalledTimes(1);
		expect(next.mock.calls[0]?.[1]).toHaveLength(2);
		expect(store.getState().tabs).toHaveLength(0);
		expect(log).toHaveBeenCalledTimes(1);
	} finally {
		unsubscribe();
		log.mockRestore();
	}
});
