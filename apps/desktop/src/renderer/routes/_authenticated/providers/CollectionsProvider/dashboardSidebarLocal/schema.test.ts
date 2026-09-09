import { describe, expect, it } from "bun:test";
import type { WorkspaceState } from "@superset/panes";
import { SESSIONS_TAG_SCOPE } from "@superset/shared/workspace-tags";
import {
	DEFAULT_V2_USER_PREFERENCES,
	dashboardSidebarSectionSchema,
	healV2UserPreferences,
	healWorkspaceLocalState,
	sanitizePaneLayout,
	v2UserPreferencesSchema,
	workspaceLocalStateSchema,
} from "./schema";

type PaneLayout = WorkspaceState<unknown>;

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
		expect(healed.terminalPresetsInitialized).toBe(false);
		expect(healed.sidebarFileLinks).toEqual(
			DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks,
		);
		expect(healed.fileLinks).toEqual(DEFAULT_V2_USER_PREFERENCES.fileLinks);
	});

	it("preserves the terminal presets initialization sentinel", () => {
		const healed = healV2UserPreferences({
			terminalPresetsInitialized: true,
		});

		expect(healed.terminalPresetsInitialized).toBe(true);
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

	it("migrates the legacy sidebar file link default to the current default", () => {
		const healed = healV2UserPreferences({
			sidebarFileLinks: {
				plain: "pane",
				shift: "newTab",
				meta: "external",
				metaShift: "external",
			},
		});

		expect(healed.sidebarFileLinks).toEqual(
			DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks,
		);
	});

	it("migrates the legacy url link default to the current default", () => {
		const healed = healV2UserPreferences({
			urlLinks: {
				plain: null,
				shift: null,
				meta: "pane",
				metaShift: "external",
			},
		});

		expect(healed.urlLinks).toEqual(DEFAULT_V2_USER_PREFERENCES.urlLinks);
		expect(healed.urlLinks.shift).toBe("newTab");
	});

	it("keeps a customized url link map untouched", () => {
		const customized = {
			plain: "external",
			shift: null,
			meta: "pane",
			metaShift: "external",
		} as const;
		const healed = healV2UserPreferences({ urlLinks: customized });

		expect(healed.urlLinks).toEqual(customized);
	});
});

describe("healV2UserPreferences sidebarProjectSortMode", () => {
	it("defaults to manual on rows written before the field existed", () => {
		expect(healV2UserPreferences({}).sidebarProjectSortMode).toBe("manual");
	});

	it("preserves a valid stored mode", () => {
		expect(
			healV2UserPreferences({ sidebarProjectSortMode: "active" })
				.sidebarProjectSortMode,
		).toBe("active");
	});

	it("degrades a retired mode to manual instead of dropping the row", () => {
		// #5956 persisted "updated" before its revert; an unknown value must
		// heal to the default, and the rest of the row must survive.
		const healed = healV2UserPreferences({
			sidebarProjectSortMode: "updated",
			rightSidebarWidth: 500,
		});
		expect(healed.sidebarProjectSortMode).toBe("manual");
		expect(healed.rightSidebarWidth).toBe(500);
	});

	it("degrades a retired mode on the write-path schema too", () => {
		const parsed = v2UserPreferencesSchema.parse({
			id: "preferences",
			sidebarProjectSortMode: "updated",
		});
		expect(parsed.sidebarProjectSortMode).toBe("manual");
	});
});

describe("healV2UserPreferences favoritePageIds", () => {
	it("defaults to an empty list on rows written before the field existed", () => {
		expect(healV2UserPreferences({}).favoritePageIds).toEqual([]);
	});

	it("preserves stored ids in order", () => {
		const healed = healV2UserPreferences({
			favoritePageIds: ["page-b", "page-a"],
		});
		expect(healed.favoritePageIds).toEqual(["page-b", "page-a"]);
	});

	it("drops non-string and empty entries", () => {
		const healed = healV2UserPreferences({
			favoritePageIds: ["page-a", "", null, 7, "page-b"],
		});
		expect(healed.favoritePageIds).toEqual(["page-a", "page-b"]);
	});

	it("recovers from a non-array value", () => {
		expect(
			healV2UserPreferences({ favoritePageIds: "page-a" }).favoritePageIds,
		).toEqual([]);
	});
});

describe("healWorkspaceLocalState", () => {
	const validPaneLayout: PaneLayout = {
		version: 1,
		tabs: [
			{
				id: "tab-1",
				createdAt: 0,
				activePaneId: "pane-1",
				layout: { type: "pane", paneId: "pane-1" },
				panes: {
					"pane-1": { id: "pane-1", kind: "terminal", data: {} },
				},
			},
		],
		activeTabId: "tab-1",
	};

	const baseStored = {
		workspaceId: "11111111-1111-1111-1111-111111111111",
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		paneLayout: validPaneLayout,
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
		// A valid layout survives the read-time heal structurally intact (heal
		// rebuilds the object, so this is structural, not reference, equality).
		expect(healed.paneLayout).toEqual(validPaneLayout);
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
			workspaceRunTerminals: undefined,
		};
		const healed = healWorkspaceLocalState(stored);
		expect(healed.viewedFiles).toEqual([]);
		expect(healed.recentlyViewedFiles).toEqual([]);
		expect(healed.workspaceRunTerminals).toEqual({});
		expect(healed.pendingCreationPresetIds).toEqual([]);
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
		expect(healed.sidebarState.pinnedAt).toBeNull();
	});

	it("preserves a stored pinnedAt and defaults it on rows written before the field existed", () => {
		expect(
			healWorkspaceLocalState(baseStored).sidebarState.pinnedAt,
		).toBeNull();
		const healed = healWorkspaceLocalState({
			...baseStored,
			sidebarState: { ...baseStored.sidebarState, pinnedAt: 1753000000000 },
		});
		expect(healed.sidebarState.pinnedAt).toBe(1753000000000);
	});

	it("does not throw on null/non-object input (parser must never throw)", () => {
		// Heal must never throw — a throw would take down the entire collection
		// load (loadFromStorage swallows the error and returns an empty Map).
		expect(() => healWorkspaceLocalState(null)).not.toThrow();
		expect(() => healWorkspaceLocalState(undefined)).not.toThrow();
		expect(() => healWorkspaceLocalState("garbage")).not.toThrow();
		expect(() => healWorkspaceLocalState(42)).not.toThrow();
	});

	it("heals a legacy-shaped persisted layout to an empty layout", () => {
		// The pre-binary-tree shape `{ panes, focusedPaneId }` has no `tabs`;
		// left as-is it fed an undefined node to the renderer and white-screened.
		const healed = healWorkspaceLocalState({
			...baseStored,
			paneLayout: { panes: [], focusedPaneId: null },
		});
		expect(healed.paneLayout).toEqual({
			version: 1,
			tabs: [],
			activeTabId: null,
		});
	});
});

describe("sanitizePaneLayout", () => {
	const validTab: PaneLayout["tabs"][number] = {
		id: "tab-1",
		createdAt: 0,
		activePaneId: "pane-1",
		layout: { type: "pane", paneId: "pane-1" },
		panes: { "pane-1": { id: "pane-1", kind: "terminal", data: {} } },
	};

	const EMPTY: PaneLayout = { version: 1, tabs: [], activeTabId: null };

	it("resets non-object / legacy / versionless input to empty", () => {
		expect(sanitizePaneLayout(null)).toEqual(EMPTY);
		expect(sanitizePaneLayout("garbage")).toEqual(EMPTY);
		expect(sanitizePaneLayout({ panes: [], focusedPaneId: null })).toEqual(
			EMPTY,
		);
		expect(sanitizePaneLayout({ version: 1 })).toEqual(EMPTY);
	});

	it("keeps a valid layout intact", () => {
		const layout: PaneLayout = {
			version: 1,
			tabs: [validTab],
			activeTabId: "tab-1",
		};
		expect(sanitizePaneLayout(layout)).toEqual(layout);
	});

	it("keeps a valid split layout intact", () => {
		const layout: PaneLayout = {
			version: 1,
			tabs: [
				{
					...validTab,
					layout: {
						type: "split",
						direction: "horizontal",
						first: { type: "pane", paneId: "pane-1" },
						second: { type: "pane", paneId: "pane-2" },
					},
					panes: {
						"pane-1": { id: "pane-1", kind: "terminal", data: {} },
						"pane-2": { id: "pane-2", kind: "chat", data: {} },
					},
				},
			],
			activeTabId: "tab-1",
		};
		expect(sanitizePaneLayout(layout)).toEqual(layout);
	});

	it("drops a corrupt tab (split missing a child) but keeps valid tabs", () => {
		const corruptTab = {
			id: "tab-bad",
			createdAt: 0,
			activePaneId: null,
			// split with `second` missing — the exact shape that crashed the
			// renderer by feeding an undefined node to LayoutNodeView.
			layout: {
				type: "split",
				direction: "horizontal",
				first: { type: "pane", paneId: "x" },
			},
			panes: {},
		};
		const result = sanitizePaneLayout({
			version: 1,
			tabs: [corruptTab, validTab],
			activeTabId: "tab-bad",
		});
		expect(result.tabs).toHaveLength(1);
		expect(result.tabs[0]?.id).toBe("tab-1");
		// activeTabId pointed at the dropped tab → repaired to a survivor.
		expect(result.activeTabId).toBe("tab-1");
	});

	it("repairs activeTabId when it points at a dropped/absent tab", () => {
		const result = sanitizePaneLayout({
			version: 1,
			tabs: [validTab],
			activeTabId: "does-not-exist",
		});
		expect(result.activeTabId).toBe("tab-1");
	});
});

describe("workspaceLocalStateSchema projectId nullability", () => {
	const paneLayout: PaneLayout = { version: 1, tabs: [], activeTabId: null };
	const row = (projectId: unknown) => ({
		workspaceId: "11111111-1111-4111-8111-111111111111",
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		paneLayout,
		sidebarState: { projectId },
	});

	it("parses a pre-widening persisted row (string projectId) unchanged", () => {
		const parsed = workspaceLocalStateSchema.parse(
			row("22222222-2222-4222-8222-222222222222"),
		);
		expect(parsed.sidebarState.projectId).toBe(
			"22222222-2222-4222-8222-222222222222",
		);
	});

	it("parses a session row (null projectId)", () => {
		const parsed = workspaceLocalStateSchema.parse(row(null));
		expect(parsed.sidebarState.projectId).toBeNull();
	});

	it("still rejects a missing projectId — heal must not synthesize null", () => {
		expect(workspaceLocalStateSchema.safeParse(row(undefined)).success).toBe(
			false,
		);
		expect(
			workspaceLocalStateSchema.safeParse({ ...row(null), sidebarState: {} })
				.success,
		).toBe(false);
	});
});

describe("workspace sidebar activeTab retirement", () => {
	const stored = {
		workspaceId: "11111111-1111-1111-1111-111111111111",
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		paneLayout: { version: 1, tabs: [], activeTabId: null },
		sidebarState: {
			projectId: "22222222-2222-2222-2222-222222222222",
			activeTab: "pages",
		},
	};

	it("prunes a row persisted on the retired pages tab back to changes", () => {
		expect(healWorkspaceLocalState(stored).sidebarState.activeTab).toBe(
			"changes",
		);
	});

	it("leaves a surviving tab untouched", () => {
		for (const tab of ["changes", "files", "review"] as const) {
			const healed = healWorkspaceLocalState({
				...stored,
				sidebarState: { ...stored.sidebarState, activeTab: tab },
			});
			expect(healed.sidebarState.activeTab).toBe(tab);
		}
	});

	it("rejects the retired value at the schema edge", () => {
		expect(
			workspaceLocalStateSchema.safeParse({
				...stored,
				sidebarState: {
					projectId: stored.sidebarState.projectId,
					activeTab: "pages",
				},
			}).success,
		).toBe(false);
	});
});

describe("dashboardSidebarSectionSchema tag folders", () => {
	// withReadHeal DELETES rows that fail parse, so every previously
	// persisted shape must keep parsing after the tag-folder widening.
	const preTagsRow = {
		sectionId: "33333333-3333-4333-8333-333333333333",
		projectId: "22222222-2222-4222-8222-222222222222",
		name: "Old group",
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		tabOrder: 2,
		isCollapsed: false,
		color: "#abcdef",
		// No `tag` — the field did not exist when this row was written.
	};

	it("parses a pre-tags persisted row; the absent tag defaults to null", () => {
		const parsed = dashboardSidebarSectionSchema.parse(preTagsRow);
		expect(parsed.tag).toBeNull();
		expect(parsed.sectionId).toBe(preTagsRow.sectionId);
	});

	it("parses a tag-backed row with a composite (non-uuid) sectionId", () => {
		const parsed = dashboardSidebarSectionSchema.parse({
			...preTagsRow,
			sectionId: "22222222-2222-4222-8222-222222222222:perf work",
			tag: "perf work",
		});
		expect(parsed.sectionId).toBe(
			"22222222-2222-4222-8222-222222222222:perf work",
		);
		expect(parsed.tag).toBe("perf work");
	});
});

describe("workspaceLocalStateSchema sectionId widening", () => {
	const paneLayout: PaneLayout = { version: 1, tabs: [], activeTabId: null };
	const row = (sectionId: unknown) => ({
		workspaceId: "11111111-1111-4111-8111-111111111111",
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		paneLayout,
		sidebarState: {
			projectId: "22222222-2222-4222-8222-222222222222",
			sectionId,
		},
	});

	it("parses a pre-widening uuid pointer unchanged", () => {
		expect(
			workspaceLocalStateSchema.parse(
				row("33333333-3333-4333-8333-333333333333"),
			).sidebarState.sectionId,
		).toBe("33333333-3333-4333-8333-333333333333");
	});

	it("parses a composite tag-folder pointer", () => {
		expect(
			workspaceLocalStateSchema.parse(
				row("22222222-2222-4222-8222-222222222222:perf"),
			).sidebarState.sectionId,
		).toBe("22222222-2222-4222-8222-222222222222:perf");
	});

	it("parses a row with the sectionId field ABSENT (defaults to null)", () => {
		expect(
			workspaceLocalStateSchema.parse(row(undefined)).sidebarState.sectionId,
		).toBeNull();
	});
});

describe("dashboardSidebarSectionSchema (Sessions scope)", () => {
	it("accepts a folder row stored under the Sessions tag scope", () => {
		const parsed = dashboardSidebarSectionSchema.parse({
			sectionId: `${SESSIONS_TAG_SCOPE}:automation`,
			projectId: SESSIONS_TAG_SCOPE,
			name: "automation",
			tag: "automation",
			createdAt: new Date().toISOString(),
		});
		expect(parsed.projectId).toBe(SESSIONS_TAG_SCOPE);
	});

	it("still rejects an arbitrary non-uuid project id", () => {
		expect(() =>
			dashboardSidebarSectionSchema.parse({
				sectionId: "x:tag",
				projectId: "x",
				name: "x",
				createdAt: new Date().toISOString(),
			}),
		).toThrow();
	});
});
