import type { PersistableTransaction } from "../../useOptimisticCollectionActions";

export interface CollectionLike<TItem> {
	has(key: string): boolean;
	update(key: string, callback: (draft: TItem) => void): PersistableTransaction;
}

export class MissingCollectionKeyError extends Error {
	constructor(
		readonly resourceLabel: string,
		readonly key: string,
	) {
		super(
			`${resourceLabel} hasn't synced to this device yet. Wait a moment and try again.`,
		);
		this.name = "MissingCollectionKeyError";
	}
}

export interface UpdateCollectionItemSafelyArgs<TItem> {
	collection: CollectionLike<TItem>;
	key: string;
	mutate: (draft: TItem) => void;
	resourceLabel: string;
}

export function updateCollectionItemSafely<TItem>({
	collection,
	key,
	mutate,
	resourceLabel,
}: UpdateCollectionItemSafelyArgs<TItem>): PersistableTransaction {
	if (!collection.has(key)) {
		throw new MissingCollectionKeyError(resourceLabel, key);
	}
	return collection.update(key, mutate);
}
