import { describe, expect, it } from "bun:test";
import {
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import { z } from "zod";

/**
 * Pins the @tanstack/db lifecycle semantics `hardenLocalCollection` relies on
 * (collections.ts): a localStorage collection only hydrates when sync starts,
 * and a mutation on a never-synced (`idle`) collection re-serializes the whole
 * storage key from empty memory — erasing every persisted row. `startSync:
 * true` makes that state unrepresentable. If a library upgrade changes either
 * behavior, these tests flag that the hardening needs a fresh look.
 */

const rowSchema = z.object({ id: z.string(), label: z.string() });
type Row = z.infer<typeof rowSchema>;

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

function seedRow(
	storage: { setItem(k: string, v: string): void },
	key: string,
) {
	storage.setItem(
		key,
		JSON.stringify({
			"s:existing": {
				versionKey: "v0",
				data: { id: "existing", label: "old" },
			},
		}),
	);
}

function makeCollection(
	storage: ReturnType<typeof makeMapStorage>["api"],
	key: string,
	options: { startSync?: boolean } = {},
) {
	return createCollection(
		localStorageCollectionOptions({
			id: key,
			storageKey: key,
			schema: rowSchema,
			getKey: (item: Row) => item.id,
			storage,
			storageEventApi: noopEvents,
			gcTime: 0,
			...options,
		}),
	);
}

describe("localStorage collection lifecycle", () => {
	it("startSync: true — insert on a fresh collection preserves existing rows", () => {
		const { store, api: storage } = makeMapStorage();
		seedRow(storage, "test-live");

		const collection = makeCollection(storage, "test-live", {
			startSync: true,
		});
		collection.insert({ id: "new", label: "new" });

		expect(collection.get("existing")?.label).toBe("old");
		const persisted = store.get("test-live") ?? "";
		expect(persisted).toContain('"id":"existing"');
		expect(persisted).toContain('"id":"new"');
	});

	it("without startSync — the same insert wipes the store (the hazard being defended against)", () => {
		const { store, api: storage } = makeMapStorage();
		seedRow(storage, "test-idle");

		const collection = makeCollection(storage, "test-idle");
		collection.insert({ id: "new", label: "new" });

		// Library behavior pin, not desired behavior: the idle collection never
		// hydrated, so the whole-store rewrite drops the pre-existing row. If
		// this starts passing rows through, startSync may no longer be needed.
		expect(store.get("test-idle") ?? "").not.toContain('"id":"existing"');
	});
});
