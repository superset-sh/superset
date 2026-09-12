export { FileDocumentStoreProvider } from "./FileDocumentStoreProvider";
export {
	acquireDocument,
	decodeBase64,
	dispatchFsEvent,
	getDocument,
	releaseDocument,
} from "./fileDocumentStore";
export type {
	ConflictResolution,
	ConflictState,
	ContentState,
	SaveResult,
	SharedFileDocument,
} from "./types";
export { useSharedFileDocument } from "./useSharedFileDocument";
