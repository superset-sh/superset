import { describe, expect, it } from "bun:test";
import {
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import {
	DEFAULT_V2_USER_PREFERENCES,
	healV2UserPreferences,
	healWorkspaceLocalState,
	V2_USER_PREFERENCES_ID,
	type V2UserPreferencesRow,
	v2UserPreferencesSchema,
	type WorkspaceLocalStateRow,
	workspaceLocalStateSchema,
} from "./dashboardSidebarLocal";
import { withReadHeal } from "./withReadHeal";

function makeMapStorage() {
	const map = new Map<string, string>();
	return {
		store: map,
		api: {
			getItem: (key: string) => map.get(key) ?? null,
			setItem: (key: string, value: string) => {
				map.set(key, value);
			},
			removeItem: (key: string) => {
				map.delete(key);
			},
		},
	};
}

const noopEvents = {
	addEventListener: () => {},
	removeEventListener: () => {},
};

describe("withReadHeal parser", () => {
	it("heals each entry's data through the heal fn while preserving the envelope", () => {
		const heal = (raw: unknown) => ({ ...(raw as object), healed: true });
		const opts = withReadHeal(
			{} as { parser?: { parse: (s: string) => unknown } },
			heal,
		);
		const raw = JSON.stringify({
			"s:foo": { versionKey: "v1", data: { a: 1 } },
			"s:bar": { versionKey: "v2", data: { b: 2 } },
		});
		const parsed = opts.parser?.parse(raw) as Record<
			string,
			{ versionKey: string; data: Record<string, unknown> }
		>;
		expect(parsed["s:foo"]?.versionKey).toBe("v1");
		expect(parsed["s:foo"]?.data).toEqual({ a: 1, healed: true });
		expect(parsed["s:bar"]?.data).toEqual({ b: 2, healed: true });
	});

	it("drops non-envelope entries so they never reach the library's hydration", () => {
		// A non-envelope value passed through would make the library throw
		// InvalidStorageDataFormatError inside its whole-store try/catch,
		// hydrating EVERY row as lost.
		const opts = withReadHeal(
			{} as {
				parser?: { parse: (s: string) => unknown };
			},
		);
		const raw = JSON.stringify({
			"s:foo": "string-not-an-envelope",
			"s:bar": { versionKey: "v1", data: { b: 2 } },
		});
		const parsed = opts.parser?.parse(raw) as Record<string, unknown>;
		expect(parsed["s:foo"]).toBeUndefined();
		expect(parsed["s:bar"]).toEqual({ versionKey: "v1", data: { b: 2 } });
	});

	it("drops only the entry whose heal throws, keeping the rest", () => {
		const heal = (raw: unknown) => {
			const data = raw as { poison?: boolean };
			if (data.poison) throw new Error("unhealable");
			return data;
		};
		const opts = withReadHeal(
			{} as { parser?: { parse: (s: string) => unknown } },
			heal,
		);
		const raw = JSON.stringify({
			"s:bad": { versionKey: "v1", data: { poison: true } },
			"s:good": { versionKey: "v2", data: { a: 1 } },
		});
		const parsed = opts.parser?.parse(raw) as Record<string, unknown>;
		expect(parsed["s:bad"]).toBeUndefined();
		expect(parsed["s:good"]).toEqual({ versionKey: "v2", data: { a: 1 } });
	});

	it("defaults to an identity heal when none is provided", () => {
		const opts = withReadHeal(
			{} as {
				parser?: { parse: (s: string) => unknown };
			},
		);
		const raw = JSON.stringify({
			"s:foo": { versionKey: "v1", data: { a: 1 } },
		});
		const parsed = opts.parser?.parse(raw) as Record<string, unknown>;
		expect(parsed["s:foo"]).toEqual({ versionKey: "v1", data: { a: 1 } });
	});
});

describe("withReadHeal end-to-end via real localStorageCollectionOptions", () => {
	it("exposes healed rows when storage holds a pre-schema-add shape", async () => {
		const { store, api: storage } = makeMapStorage();
		// Pre-populate storage with the exact shape that crashed buildHint:
		// a v2-user-preferences row missing `sidebarFileLinks`.
		const stale = {
			id: "preferences",
			fileLinks: { plain: null, shift: null, meta: "pane", metaShift: null },
			urlLinks: { plain: null, shift: null, meta: "pane", metaShift: null },
			rightSidebarOpen: true,
			rightSidebarTab: "changes",
			rightSidebarWidth: 340,
			deleteLocalBranch: false,
		};
		storage.setItem(
			"test-prefs",
			JSON.stringify({
				"s:preferences": { versionKey: "v0", data: stale },
			}),
		);

		const collection = createCollection(
			localStorageCollectionOptions(
				withReadHeal(
					{
						id: "test-prefs",
						storageKey: "test-prefs",
						schema: v2UserPreferencesSchema,
						getKey: (item: V2UserPreferencesRow) => item.id as string,
						storage,
						storageEventApi: noopEvents,
					},
					healV2UserPreferences,
				),
			),
		);
		await collection.preload();

		const row = collection.get(V2_USER_PREFERENCES_ID);
		expect(row).toBeDefined();
		expect(row?.sidebarFileLinks).toEqual(
			DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks,
		);
		// Storage isn't touched by reads — heal happens in-memory only. The
		// write-back happens on the next mutation, not at read time.
		expect(store.get("test-prefs")).toContain('"versionKey":"v0"');
	});

	it("returns stale shape unchanged when wrapper is NOT applied (regression guard)", async () => {
		const { api: storage } = makeMapStorage();
		const stale = {
			id: "preferences",
			fileLinks: { plain: null, shift: null, meta: "pane", metaShift: null },
			urlLinks: { plain: null, shift: null, meta: "pane", metaShift: null },
			rightSidebarOpen: true,
			rightSidebarTab: "changes",
			rightSidebarWidth: 340,
			deleteLocalBranch: false,
		};
		storage.setItem(
			"test-prefs-naked",
			JSON.stringify({
				"s:preferences": { versionKey: "v0", data: stale },
			}),
		);

		const collection = createCollection(
			localStorageCollectionOptions({
				id: "test-prefs-naked",
				storageKey: "test-prefs-naked",
				schema: v2UserPreferencesSchema,
				getKey: (item) => item.id as string,
				storage,
				storageEventApi: noopEvents,
			}),
		);
		await collection.preload();

		const row = collection.get(V2_USER_PREFERENCES_ID);
		// Pins the underlying library behavior we're working around: without
		// the heal wrapper the field is undefined, which is what crashed
		// buildHint. If this ever starts returning a defined value the wrapper
		// may no longer be needed.
		expect(row?.sidebarFileLinks).toBeUndefined();
	});

	it("hydrates surviving rows when the store holds one corrupt entry", async () => {
		const { api: storage } = makeMapStorage();
		const workspaceId = "11111111-1111-1111-1111-111111111111";
		const projectId = "22222222-2222-2222-2222-222222222222";
		storage.setItem(
			"test-corrupt",
			JSON.stringify({
				// Not a {versionKey, data} envelope: without the per-row drop the
				// library throws mid-hydration and treats the WHOLE store as empty,
				// and the next mutation persists that emptiness.
				"s:corrupt": 42,
				[`s:${workspaceId}`]: {
					versionKey: "v0",
					data: {
						workspaceId,
						createdAt: "2026-01-01T00:00:00.000Z",
						paneLayout: { version: 1, tabs: [], activeTabId: null },
						sidebarState: { projectId },
					},
				},
			}),
		);

		const collection = createCollection(
			localStorageCollectionOptions(
				withReadHeal(
					{
						id: "test-corrupt",
						storageKey: "test-corrupt",
						schema: workspaceLocalStateSchema,
						getKey: (item: WorkspaceLocalStateRow) => item.workspaceId,
						storage,
						storageEventApi: noopEvents,
					},
					healWorkspaceLocalState,
				),
			),
		);
		await collection.preload();

		expect(collection.get(workspaceId)?.sidebarState.projectId).toBe(projectId);
		expect(collection.size).toBe(1);
	});

	it("heals a workspaceLocalState row missing optional + nested fields", async () => {
		const { api: storage } = makeMapStorage();
		const workspaceId = "11111111-1111-1111-1111-111111111111";
		const projectId = "22222222-2222-2222-2222-222222222222";
		// Hypothetical pre-evolution shape: identity fields present, optional
		// top-level + nested defaults absent.
		const stale = {
			workspaceId,
			createdAt: "2026-01-01T00:00:00.000Z",
			paneLayout: { panes: [], focusedPaneId: null },
			sidebarState: { projectId },
		};
		storage.setItem(
			"test-wls",
			JSON.stringify({
				[`s:${workspaceId}`]: { versionKey: "v0", data: stale },
			}),
		);

		const collection = createCollection(
			localStorageCollectionOptions(
				withReadHeal(
					{
						id: "test-wls",
						storageKey: "test-wls",
						schema: workspaceLocalStateSchema,
						getKey: (item: WorkspaceLocalStateRow) => item.workspaceId,
						storage,
						storageEventApi: noopEvents,
					},
					healWorkspaceLocalState,
				),
			),
		);
		await collection.preload();

		const row = collection.get(workspaceId);
		expect(row).toBeDefined();
		// Identity fields preserved.
		expect(row?.workspaceId).toBe(workspaceId);
		expect(row?.sidebarState.projectId).toBe(projectId);
		// Optional defaults filled.
		expect(row?.viewedFiles).toEqual([]);
		expect(row?.recentlyViewedFiles).toEqual([]);
		expect(row?.workspaceRunTerminals).toEqual({});
		// Nested sidebarState defaults filled.
		expect(row?.sidebarState.activeTab).toBe("changes");
		expect(row?.sidebarState.changesFilter).toEqual({ kind: "all" });
		expect(row?.sidebarState.isHidden).toBe(false);
	});
});

describe("healV2UserPreferences hiddenBuiltinPresetIds pruning", () => {
	it("drops ids that are not known built-in presets", () => {
		const healed = healV2UserPreferences({
			id: "preferences",
			hiddenBuiltinPresetIds: ["superset-cli", "retired-preset"],
		});
		expect(healed.hiddenBuiltinPresetIds).toEqual(["superset-cli"]);
	});

	it("defaults a malformed value to an empty array", () => {
		const healed = healV2UserPreferences({
			id: "preferences",
			hiddenBuiltinPresetIds: "superset-cli",
		});
		expect(healed.hiddenBuiltinPresetIds).toEqual([]);
	});
});
