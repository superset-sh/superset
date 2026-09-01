/**
 * Droppable ids for collection drag & drop.
 *
 * Project rows are sortable by their plain project id, so collection drop targets
 * are namespaced to keep the two apart in a single DndContext. Dropping on a
 * collection header moves the project into that collection; dropping on the root zone
 * takes it back out.
 */
const COLLECTION_DROP_PREFIX = "collection-drop::";

/** Sentinel id for the sidebar root (i.e. "not in any collection"). */
export const COLLECTION_DROP_ROOT = `${COLLECTION_DROP_PREFIX}root`;

export function collectionDropId(collectionId: string): string {
	return `${COLLECTION_DROP_PREFIX}${collectionId}`;
}

export function isCollectionDropId(id: string): boolean {
	return id.startsWith(COLLECTION_DROP_PREFIX);
}

/**
 * Resolve a droppable id to the collection it targets: a collection id, or null for the
 * root zone. Returns undefined when the id is not a collection drop target.
 */
export function parseCollectionDropId(id: string): string | null | undefined {
	if (!isCollectionDropId(id)) return undefined;
	if (id === COLLECTION_DROP_ROOT) return null;
	return id.slice(COLLECTION_DROP_PREFIX.length);
}
