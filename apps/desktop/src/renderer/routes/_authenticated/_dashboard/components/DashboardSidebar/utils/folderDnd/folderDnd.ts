import {
	type CollisionDetection,
	closestCenter,
	pointerWithin,
} from "@dnd-kit/core";

/**
 * Droppable ids for folder drag & drop.
 *
 * Project rows are sortable by their plain project id, so folder drop targets
 * are namespaced to keep the two apart in a single DndContext. Dropping on a
 * folder header moves the project into that folder; dropping on the root zone
 * takes it back out.
 */
const FOLDER_DROP_PREFIX = "folder-drop::";

/**
 * Pointer-first collision detection. closestCenter alone measures from the
 * dragged rect's centre — a project section is measured tall at drag start, so
 * the effective target sat far from the cursor and small strips like folder
 * headers or the root zone were near-impossible to hit. The pointer decides
 * whenever it is inside any droppable; closestCenter stays as the fallback for
 * keyboard drags, which have no pointer.
 */
export const folderAwareCollisionDetection: CollisionDetection = (args) => {
	const withPointer = pointerWithin(args);
	return withPointer.length > 0 ? withPointer : closestCenter(args);
};

/** Sentinel id for the sidebar root (i.e. "not in any folder"). */
export const FOLDER_DROP_ROOT = `${FOLDER_DROP_PREFIX}root`;

export function folderDropId(folderId: string): string {
	return `${FOLDER_DROP_PREFIX}${folderId}`;
}

export function isFolderDropId(id: string): boolean {
	return id.startsWith(FOLDER_DROP_PREFIX);
}

/**
 * Resolve a droppable id to the folder it targets: a folder id, or null for the
 * root zone. Returns undefined when the id is not a folder drop target.
 */
export function parseFolderDropId(id: string): string | null | undefined {
	if (!isFolderDropId(id)) return undefined;
	if (id === FOLDER_DROP_ROOT) return null;
	return id.slice(FOLDER_DROP_PREFIX.length);
}
