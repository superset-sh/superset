import type { StoreApi } from "zustand/vanilla";
import type { Pane, SplitPosition, Tab } from "../../types";
import type { WorkspaceStore } from "../store";
import { generateId } from "../store/utils";

type Store<TData> = StoreApi<WorkspaceStore<TData>>;

const linkedStores = new Set<WeakRef<Store<unknown>>>();

function linkStores<TData>(...stores: Store<TData>[]): void {
	for (const store of stores) {
		const known = [...linkedStores].some((ref) => ref.deref() === store);
		if (!known) linkedStores.add(new WeakRef(store as Store<unknown>));
	}
}

export function isPaneInLinkedStore(paneId: string): boolean {
	for (const ref of linkedStores) {
		const store = ref.deref();
		if (!store) {
			linkedStores.delete(ref);
			continue;
		}
		if (store.getState().getPane(paneId)) return true;
	}
	return false;
}

function detachPane<TData>(
	source: Store<TData>,
	paneId: string,
): Pane<TData> | null {
	const location = source.getState().getPane(paneId);
	if (!location) return null;
	source
		.getState()
		.closePane({ tabId: location.tabId, paneId, intent: "remove" });
	return location.pane;
}

function detachTab<TData>(
	source: Store<TData>,
	tabId: string,
): Tab<TData> | null {
	const tab = source.getState().getTab(tabId);
	if (!tab) return null;
	source.getState().removeTab(tabId, { intent: "remove" });
	return tab;
}

export function transferPaneToSplit<TData>(args: {
	source: Store<TData>;
	target: Store<TData>;
	paneId: string;
	targetPaneId: string;
	position: SplitPosition;
}): void {
	if (args.source === args.target) return;
	linkStores(args.source, args.target);
	const targetLocation = args.target.getState().getPane(args.targetPaneId);
	if (!targetLocation) return;
	const pane = detachPane(args.source, args.paneId);
	if (!pane) return;
	args.target.getState().splitPane({
		tabId: targetLocation.tabId,
		paneId: args.targetPaneId,
		position: args.position,
		newPane: pane,
	});
}

export function transferPaneToNewTab<TData>(args: {
	source: Store<TData>;
	target: Store<TData>;
	paneId: string;
	toIndex?: number;
}): void {
	if (args.source === args.target) return;
	linkStores(args.source, args.target);
	const pane = detachPane(args.source, args.paneId);
	if (!pane) return;
	args.target.getState().insertTab({
		tab: {
			id: generateId("tab"),
			createdAt: Date.now(),
			activePaneId: pane.id,
			layout: { type: "pane", paneId: pane.id },
			panes: { [pane.id]: pane },
		},
		index: args.toIndex,
	});
}

export function transferTabToIndex<TData>(args: {
	source: Store<TData>;
	target: Store<TData>;
	tabId: string;
	toIndex?: number;
}): void {
	if (args.source === args.target) return;
	if (args.target.getState().getTab(args.tabId)) return;
	linkStores(args.source, args.target);
	const tab = detachTab(args.source, args.tabId);
	if (!tab) return;
	args.target.getState().insertTab({ tab, index: args.toIndex });
}

export function transferTabToSplit<TData>(args: {
	source: Store<TData>;
	target: Store<TData>;
	tabId: string;
	targetPaneId: string;
	position: SplitPosition;
}): void {
	if (args.source === args.target) return;
	linkStores(args.source, args.target);
	if (!args.target.getState().getPane(args.targetPaneId)) return;
	if (args.target.getState().getTab(args.tabId)) return;
	const tab = detachTab(args.source, args.tabId);
	if (!tab) return;
	args.target.getState().insertTab({ tab });
	args.target.getState().moveTabToSplit({
		sourceTabId: tab.id,
		targetPaneId: args.targetPaneId,
		position: args.position,
	});
}

export function transferAllTabs<TData>(args: {
	source: Store<TData>;
	target: Store<TData>;
}): void {
	if (args.source === args.target) return;
	linkStores(args.source, args.target);
	for (const tab of args.source.getState().tabs) {
		transferTabToIndex({
			source: args.source,
			target: args.target,
			tabId: tab.id,
		});
	}
}
