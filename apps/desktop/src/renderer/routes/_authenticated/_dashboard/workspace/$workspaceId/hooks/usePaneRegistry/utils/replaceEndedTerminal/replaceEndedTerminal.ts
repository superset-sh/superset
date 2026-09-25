import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../../../types";
import { markTerminalReplacementCancelled } from "../../../../utils/cancelledTerminalReplacements";

async function replace({
	store,
	paneId,
	terminalId,
	create,
	dispose,
	prepare,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	paneId: string;
	terminalId: string;
	create: () => Promise<string>;
	dispose: (id: string) => Promise<unknown>;
	prepare: () => (id: string) => void;
}): Promise<void> {
	const matches = () => {
		const pane = store.getState().getPane(paneId)?.pane;
		return (
			pane?.kind === "terminal" &&
			(pane.data as TerminalPaneData).terminalId === terminalId
		);
	};
	if (!matches()) return;
	const applyReplacement = prepare();
	const replacementId = await create();
	if (!matches()) {
		markTerminalReplacementCancelled(replacementId);
		try {
			await dispose(replacementId).catch(() => dispose(replacementId));
		} finally {
			for (const tab of store.getState().tabs) {
				for (const pane of Object.values(tab.panes)) {
					if (
						pane.kind === "terminal" &&
						(pane.data as TerminalPaneData).terminalId === replacementId
					) {
						store
							.getState()
							.closePane({ tabId: tab.id, paneId: pane.id, intent: "remove" });
					}
				}
			}
		}
		return;
	}
	applyReplacement(replacementId);
	store.getState().setPaneData({ paneId, data: { terminalId: replacementId } });
}

const pendingReplacements = new WeakMap<
	StoreApi<WorkspaceStore<PaneViewerData>>,
	Map<string, Promise<void>>
>();

export function replaceEndedTerminal(
	input: Parameters<typeof replace>[0],
): Promise<void> {
	let pending = pendingReplacements.get(input.store);
	if (!pending) {
		pending = new Map();
		pendingReplacements.set(input.store, pending);
	}
	const key = `${input.paneId}\0${input.terminalId}`;
	const existing = pending.get(key);
	if (existing) return existing;
	const result = replace(input);
	pending.set(key, result);
	const cleanup = () => {
		pending.delete(key);
	};
	void result.then(cleanup, cleanup);
	return result;
}
