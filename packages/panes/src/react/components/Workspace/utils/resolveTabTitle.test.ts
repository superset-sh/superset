import { describe, expect, it } from "bun:test";
import type { Pane, Tab } from "../../../../types";
import type { PaneRegistry } from "../../../types";
import { resolveTabTitle } from "./resolveTabTitle";

interface TestData {
	label?: string;
}

const registry: PaneRegistry<TestData> = {
	titled: {
		renderPane: () => null,
		getTitle: (pane) => pane.data.label ?? "",
	},
	untitled: {
		renderPane: () => null,
		// no getTitle — exercises the fallback path
	},
};

function pane(id: string, kind: string, label?: string): Pane<TestData> {
	return { id, kind, data: { label } };
}

function tab(args: {
	id: string;
	titleOverride?: string;
	activePaneId: string | null;
	panes: Pane<TestData>[];
}): Tab<TestData> {
	const panesMap: Record<string, Pane<TestData>> = {};
	for (const p of args.panes) panesMap[p.id] = p;
	return {
		id: args.id,
		titleOverride: args.titleOverride,
		createdAt: 0,
		activePaneId: args.activePaneId,
		layout: { type: "pane", paneId: args.panes[0]?.id ?? "" },
		panes: panesMap,
	};
}

describe("resolveTabTitle", () => {
	it("uses tab.titleOverride when set", () => {
		const t = tab({
			id: "t1",
			titleOverride: "Custom",
			activePaneId: "p1",
			panes: [pane("p1", "titled", "from-pane")],
		});
		expect(resolveTabTitle(t, [t], registry)).toBe("Custom");
	});

	it("single-pane: elevates pane.titleOverride", () => {
		const p = {
			...pane("p1", "titled", "registry"),
			titleOverride: "Override",
		};
		const t = tab({ id: "t1", activePaneId: "p1", panes: [p] });
		expect(resolveTabTitle(t, [t], registry)).toBe("Override");
	});

	it("single-pane: elevates registry.getTitle", () => {
		const t = tab({
			id: "t1",
			activePaneId: "p1",
			panes: [pane("p1", "titled", "from-registry")],
		});
		expect(resolveTabTitle(t, [t], registry)).toBe("from-registry");
	});

	it("single-pane: falls back to Tab N when registry returns empty", () => {
		const t = tab({
			id: "t1",
			activePaneId: "p1",
			panes: [pane("p1", "untitled")],
		});
		expect(resolveTabTitle(t, [t], registry)).toBe("Tab 1");
	});

	it("multi-pane: elevates active pane's title", () => {
		const t = tab({
			id: "t1",
			activePaneId: "p2",
			panes: [pane("p1", "titled", "first"), pane("p2", "titled", "second")],
		});
		expect(resolveTabTitle(t, [t], registry)).toBe("second");
	});

	it("multi-pane: falls back to Tab N when active pane has no title", () => {
		const t = tab({
			id: "t1",
			activePaneId: "p2",
			panes: [pane("p1", "titled", "first"), pane("p2", "untitled")],
		});
		expect(resolveTabTitle(t, [t], registry)).toBe("Tab 1");
	});

	it("multi-pane: falls back to Tab N when activePaneId references missing pane", () => {
		const t = tab({
			id: "t1",
			activePaneId: "stale",
			panes: [pane("p1", "titled", "first"), pane("p2", "titled", "second")],
		});
		expect(resolveTabTitle(t, [t], registry)).toBe("Tab 1");
	});

	it("multi-pane: falls back to Tab N when activePaneId is null", () => {
		const t = tab({
			id: "t1",
			activePaneId: null,
			panes: [pane("p1", "titled", "first"), pane("p2", "titled", "second")],
		});
		expect(resolveTabTitle(t, [t], registry)).toBe("Tab 1");
	});

	it("uses tab index from the tabs array for the Tab N fallback", () => {
		const t1 = tab({
			id: "t1",
			activePaneId: "p1",
			panes: [pane("p1", "untitled")],
		});
		const t2 = tab({
			id: "t2",
			activePaneId: "p2",
			panes: [pane("p2", "untitled")],
		});
		expect(resolveTabTitle(t2, [t1, t2], registry)).toBe("Tab 2");
	});
});
