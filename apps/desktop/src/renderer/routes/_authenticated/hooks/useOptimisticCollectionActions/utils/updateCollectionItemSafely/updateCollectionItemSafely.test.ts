import { describe, expect, mock, test } from "bun:test";
import type { PersistableTransaction } from "../../useOptimisticCollectionActions";
import {
	type CollectionLike,
	MissingCollectionKeyError,
	updateCollectionItemSafely,
} from "./updateCollectionItemSafely";

interface FakeWorkspace {
	id: string;
	name: string;
}

function makeCollection(items: Array<FakeWorkspace>) {
	const map = new Map(items.map((item) => [item.id, item]));
	const updateCalls: Array<{ key: string; draft: FakeWorkspace }> = [];
	const transaction: PersistableTransaction = {
		isPersisted: { promise: Promise.resolve() },
	};
	const collection: CollectionLike<FakeWorkspace> = {
		has: (key) => map.has(key),
		update: mock((key: string, callback: (draft: FakeWorkspace) => void) => {
			const current = map.get(key);
			if (!current) {
				throw new Error(
					`The key "${key}" was passed to update but an object for this key was not found in the collection`,
				);
			}
			const draft = { ...current };
			callback(draft);
			updateCalls.push({ key, draft });
			return transaction;
		}),
	};

	return { collection, updateCalls, transaction };
}

describe("updateCollectionItemSafely", () => {
	test("delegates to collection.update when key exists", () => {
		const { collection, updateCalls, transaction } = makeCollection([
			{ id: "ws-1", name: "original" },
		]);

		const result = updateCollectionItemSafely<FakeWorkspace>({
			collection,
			key: "ws-1",
			resourceLabel: "Workspace",
			mutate: (draft) => {
				draft.name = "renamed";
			},
		});

		expect(result).toBe(transaction);
		expect(updateCalls).toEqual([
			{ key: "ws-1", draft: { id: "ws-1", name: "renamed" } },
		]);
	});

	test("throws MissingCollectionKeyError when key is absent from the collection", () => {
		const { collection } = makeCollection([{ id: "ws-1", name: "original" }]);

		const call = () =>
			updateCollectionItemSafely<FakeWorkspace>({
				collection,
				key: "fefa7e0a-616b-405a-9b77-4df5a9b9bc77",
				resourceLabel: "Workspace",
				mutate: (draft) => {
					draft.name = "renamed";
				},
			});

		expect(call).toThrow(MissingCollectionKeyError);
		expect(call).toThrow(/hasn't synced to this device yet/);
		expect(call).not.toThrow(/was passed to update but an object for this key/);
	});

	test("does not invoke collection.update when key is missing", () => {
		const { collection } = makeCollection([]);

		try {
			updateCollectionItemSafely<FakeWorkspace>({
				collection,
				key: "missing",
				resourceLabel: "Workspace",
				mutate: () => {},
			});
		} catch {
			// expected
		}

		expect(collection.update).not.toHaveBeenCalled();
	});
});
