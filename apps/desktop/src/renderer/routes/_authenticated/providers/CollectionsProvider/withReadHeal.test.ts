import { describe, expect, it } from "bun:test";
import {
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import {
	DEFAULT_V2_USER_PREFERENCES,
	healV2UserPreferences,
	V2_USER_PREFERENCES_ID,
	v2UserPreferencesSchema,
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
		const opts = withReadHeal({}, heal);
		const raw = JSON.stringify({
			"s:foo": { versionKey: "v1", data: { a: 1 } },
			"s:bar": { versionKey: "v2", data: { b: 2 } },
		});
		const parsed = opts.parser?.parse(raw) as Record<
			string,
			{ versionKey: string; data: { healed: boolean } }
		>;
		expect(parsed["s:foo"]?.versionKey).toBe("v1");
		expect(parsed["s:foo"]?.data).toEqual({ a: 1, healed: true });
		expect(parsed["s:bar"]?.data).toEqual({ b: 2, healed: true });
	});

	it("passes non-envelope values through unchanged", () => {
		const heal = () => {
			throw new Error("should not be called for non-envelope values");
		};
		const opts = withReadHeal({}, heal);
		const raw = JSON.stringify({ "s:foo": "string-not-an-envelope" });
		const parsed = opts.parser?.parse(raw) as Record<string, unknown>;
		expect(parsed["s:foo"]).toBe("string-not-an-envelope");
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
						getKey: (item) => item.id as string,
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
});
