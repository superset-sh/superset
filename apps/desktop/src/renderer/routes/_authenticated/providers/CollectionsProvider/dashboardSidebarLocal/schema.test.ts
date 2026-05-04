import { describe, expect, it } from "bun:test";
import {
	DEFAULT_V2_USER_PREFERENCES,
	healV2UserPreferences,
	healWorkspaceLocalState,
} from "./schema";

describe("healV2UserPreferences", () => {
	it("returns full defaults for empty/non-object input", () => {
		expect(healV2UserPreferences({})).toEqual(DEFAULT_V2_USER_PREFERENCES);
		expect(healV2UserPreferences(null)).toEqual(DEFAULT_V2_USER_PREFERENCES);
		expect(healV2UserPreferences(undefined)).toEqual(
			DEFAULT_V2_USER_PREFERENCES,
		);
	});

	it("preserves stored top-level fields and fills missing ones", () => {
		const stored = { rightSidebarOpen: false, rightSidebarWidth: 500 };
		const healed = healV2UserPreferences(stored);
		expect(healed.rightSidebarOpen).toBe(false);
		expect(healed.rightSidebarWidth).toBe(500);
		expect(healed.sidebarFileLinks).toEqual(
			DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks,
		);
		expect(healed.fileLinks).toEqual(DEFAULT_V2_USER_PREFERENCES.fileLinks);
	});

	it("reproduces the original crash shape: missing sidebarFileLinks entirely", () => {
		// Shape of rows persisted before sidebarFileLinks was added in e8067e196.
		const stored = {
			id: "preferences",
			fileLinks: { plain: null, shift: null, meta: "pane", metaShift: null },
			urlLinks: { plain: null, shift: null, meta: "pane", metaShift: null },
			rightSidebarOpen: true,
			rightSidebarTab: "changes",
			rightSidebarWidth: 340,
			deleteLocalBranch: false,
		};
		const healed = healV2UserPreferences(stored);
		expect(healed.sidebarFileLinks).toEqual(
			DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks,
		);
		// Every tier defined — the property buildHint reads.
		expect(healed.sidebarFileLinks.shift).toBeDefined();
	});

	it("fills missing tiers inside an otherwise-present tier map", () => {
		// Hypothetical future shape: sidebarFileLinks exists but a tier was added
		// to the schema after this row was written.
		const stored = {
			sidebarFileLinks: { plain: "pane", meta: "external" },
		};
		const healed = healV2UserPreferences(stored);
		expect(healed.sidebarFileLinks.plain).toBe("pane");
		expect(healed.sidebarFileLinks.meta).toBe("external");
		// Tiers absent from the stored row fall back to defaults.
		expect(healed.sidebarFileLinks.shift).toBe(
			DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks.shift,
		);
		expect(healed.sidebarFileLinks.metaShift).toBe(
			DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks.metaShift,
		);
	});
});

describe("healWorkspaceLocalState", () => {
	const baseStored = {
		workspaceId: "11111111-1111-1111-1111-111111111111",
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		paneLayout: { panes: [], focusedPaneId: null },
		sidebarState: {
			projectId: "22222222-2222-2222-2222-222222222222",
			tabOrder: 3,
			sectionId: null,
			changesFilter: { kind: "all" },
			activeTab: "changes",
			isHidden: false,
		},
		viewedFiles: ["a.ts"],
		recentlyViewedFiles: [],
	};

	it("preserves identity fields and stored values verbatim", () => {
		const healed = healWorkspaceLocalState(baseStored);
		expect(healed.workspaceId).toBe(baseStored.workspaceId);
		expect(healed.createdAt).toBe(baseStored.createdAt);
		// Reference equality — bun's strict toBe types reject the narrow stub,
		// so compare via Object.is on a widened lhs and assert the boolean.
		expect(Object.is(healed.paneLayout as unknown, baseStored.paneLayout)).toBe(
			true,
		);
		expect(healed.sidebarState.projectId).toBe(
			baseStored.sidebarState.projectId,
		);
		expect(healed.sidebarState.tabOrder).toBe(3);
		expect(healed.viewedFiles).toEqual(["a.ts"]);
	});

	it("fills missing top-level optional fields", () => {
		const stored = {
			...baseStored,
			viewedFiles: undefined,
			recentlyViewedFiles: undefined,
		};
		const healed = healWorkspaceLocalState(stored);
		expect(healed.viewedFiles).toEqual([]);
		expect(healed.recentlyViewedFiles).toEqual([]);
	});

	it("fills missing nested sidebarState fields while preserving projectId", () => {
		// Hypothetical future shape: a sidebarState field was added after this
		// row was written. Identity (projectId) survives; defaults fill in.
		const stored = {
			...baseStored,
			sidebarState: { projectId: baseStored.sidebarState.projectId },
		};
		const healed = healWorkspaceLocalState(stored);
		expect(healed.sidebarState.projectId).toBe(
			baseStored.sidebarState.projectId,
		);
		expect(healed.sidebarState.tabOrder).toBe(0);
		expect(healed.sidebarState.sectionId).toBeNull();
		expect(healed.sidebarState.changesFilter).toEqual({ kind: "all" });
		expect(healed.sidebarState.activeTab).toBe("changes");
		expect(healed.sidebarState.isHidden).toBe(false);
	});

	it("does not throw on null/non-object input (parser must never throw)", () => {
		// Heal must never throw — a throw would take down the entire collection
		// load (loadFromStorage swallows the error and returns an empty Map).
		expect(() => healWorkspaceLocalState(null)).not.toThrow();
		expect(() => healWorkspaceLocalState(undefined)).not.toThrow();
		expect(() => healWorkspaceLocalState("garbage")).not.toThrow();
		expect(() => healWorkspaceLocalState(42)).not.toThrow();
	});
});
