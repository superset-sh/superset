import type {
	ContentState,
	SharedFileDocument,
} from "../../../../../../../../state/fileDocumentStore";

/** A read-only stand-in for a file that lives in a git object rather than
 * on disk, so the FilePane registry views can render it unchanged. Nothing
 * can be edited or saved through it, and it never changes after creation:
 * callers build a new one when the underlying query data changes. */
export function createSnapshotDocument({
	workspaceId,
	absolutePath,
	content,
}: {
	workspaceId: string;
	absolutePath: string;
	content: ContentState;
}): SharedFileDocument {
	const unsupported = () =>
		Promise.reject(new Error("Snapshot documents are read-only"));
	return {
		id: `snapshot:${workspaceId}:${absolutePath}`,
		workspaceId,
		absolutePath,
		content,
		dirty: false,
		pendingSave: false,
		saveError: null,
		conflict: null,
		orphaned: false,
		hasExternalChange: false,
		isBinary: true,
		byteSize: content.kind === "bytes" ? content.value.byteLength : null,
		setContent: () => {},
		save: unsupported,
		reload: () => Promise.resolve(),
		loadUnlimited: () => Promise.resolve(),
		resolveConflict: () => Promise.resolve(),
		clearSaveError: () => {},
		subscribe: () => () => {},
		getVersion: () => 0,
	};
}
