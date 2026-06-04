import type { workspaceTrpc } from "@superset/workspace-client";
import type { FsWatchEvent } from "@superset/workspace-fs/client";
import { isImageFile } from "shared/file-types";
import type {
	ConflictResolution,
	ConflictState,
	ContentState,
	SaveResult,
	SharedFileDocument,
} from "./types";

type WorkspaceTrpcClient = ReturnType<typeof workspaceTrpc.createClient>;

interface DocumentEntry {
	id: string;
	workspaceId: string;
	absolutePath: string;
	trpcClient: WorkspaceTrpcClient;
	content: ContentState;
	savedContentText: string | null;
	pendingSave: boolean;
	saveError: Error | null;
	conflict: ConflictState | null;
	orphaned: boolean;
	hasExternalChange: boolean;
	isBinary: boolean | null;
	byteSize: number | null;
	refCount: number;
	version: number;
	subscribers: Set<() => void>;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const BINARY_CHECK_SIZE = 8192;

const entries = new Map<string, DocumentEntry>();

function key(workspaceId: string, absolutePath: string): string {
	return `${workspaceId}:${absolutePath}`;
}

function notify(entry: DocumentEntry): void {
	entry.version += 1;
	for (const listener of entry.subscribers) {
		listener();
	}
}

function computeDirty(entry: DocumentEntry): boolean {
	if (entry.content.kind !== "text") return false;
	if (entry.savedContentText === null) return false;
	return entry.content.value !== entry.savedContentText;
}

function resetForLoad(entry: DocumentEntry): void {
	entry.content = { kind: "loading" };
	entry.savedContentText = null;
	entry.conflict = null;
	entry.hasExternalChange = false;
	entry.saveError = null;
}

function isBinaryText(content: string): boolean {
	const checkLength = Math.min(content.length, BINARY_CHECK_SIZE);
	for (let i = 0; i < checkLength; i += 1) {
		if (content.charCodeAt(i) === 0) {
			return true;
		}
	}
	return false;
}

function decodeBase64(value: string): Uint8Array {
	if (typeof Buffer !== "undefined") {
		return new Uint8Array(Buffer.from(value, "base64"));
	}
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function toBytes(value: string | Uint8Array): Uint8Array {
	return typeof value === "string" ? decodeBase64(value) : value;
}

async function loadEntry(
	entry: DocumentEntry,
	options: { unlimited?: boolean } = {},
): Promise<void> {
	const client = entry.trpcClient;
	const readAsBinary = isImageFile(entry.absolutePath);
	const maxBytes = options.unlimited ? undefined : DEFAULT_MAX_BYTES;
	try {
		const result = await client.filesystem.readFile.query({
			workspaceId: entry.workspaceId,
			absolutePath: entry.absolutePath,
			encoding: readAsBinary ? undefined : "utf-8",
			maxBytes,
		});

		entry.byteSize = result.byteLength;
		entry.orphaned = false;
		entry.hasExternalChange = false;

		if (result.exceededLimit) {
			entry.content = { kind: "too-large" };
			notify(entry);
			return;
		}

		if (result.kind === "bytes") {
			entry.isBinary = true;
			entry.content = {
				kind: "bytes",
				value: toBytes(result.content),
				revision: result.revision,
			};
			notify(entry);
			return;
		}

		entry.isBinary = isBinaryText(result.content);
		entry.content = {
			kind: "text",
			value: result.content,
			revision: result.revision,
		};
		entry.savedContentText = result.content;
		notify(entry);
	} catch (error) {
		const isNotFound = isEnoentLikeError(error);
		entry.content = isNotFound
			? { kind: "not-found" }
			: { kind: "error", error: error as Error };
		notify(entry);
	}
}

function isEnoentLikeError(error: unknown): boolean {
	if (!error) return false;
	const message =
		error instanceof Error ? error.message.toLowerCase() : String(error);
	return (
		message.includes("enoent") ||
		message.includes("no such file") ||
		message.includes("not found")
	);
}

async function fetchCurrentDiskContent(
	entry: DocumentEntry,
): Promise<string | null> {
	if (entry.isBinary) return null;
	const client = entry.trpcClient;
	try {
		const result = await client.filesystem.readFile.query({
			workspaceId: entry.workspaceId,
			absolutePath: entry.absolutePath,
			encoding: "utf-8",
			maxBytes: DEFAULT_MAX_BYTES,
		});
		if (result.kind !== "text" || result.exceededLimit) return null;
		if (isBinaryText(result.content)) return null;
		return result.content;
	} catch {
		return null;
	}
}

function createHandle(entry: DocumentEntry): SharedFileDocument {
	return {
		get id() {
			return entry.id;
		},
		get workspaceId() {
			return entry.workspaceId;
		},
		get absolutePath() {
			return entry.absolutePath;
		},
		get content() {
			return entry.content;
		},
		get dirty() {
			return computeDirty(entry);
		},
		get pendingSave() {
			return entry.pendingSave;
		},
		get saveError() {
			return entry.saveError;
		},
		get conflict() {
			return entry.conflict;
		},
		get orphaned() {
			return entry.orphaned;
		},
		get hasExternalChange() {
			return entry.hasExternalChange;
		},
		get isBinary() {
			return entry.isBinary;
		},
		get byteSize() {
			return entry.byteSize;
		},
		setContent(next) {
			if (entry.content.kind !== "text") return;
			if (entry.content.value === next) return;
			entry.content = { ...entry.content, value: next };
			notify(entry);
		},
		async save(opts): Promise<SaveResult> {
			if (entry.content.kind !== "text") {
				return {
					status: "error",
					error: new Error("Cannot save non-text content"),
				};
			}
			const client = entry.trpcClient;
			const currentValue = entry.content.value;
			const currentRevision = entry.content.revision;
			entry.pendingSave = true;
			entry.saveError = null;
			notify(entry);
			try {
				const result = await client.filesystem.writeFile.mutate({
					workspaceId: entry.workspaceId,
					absolutePath: entry.absolutePath,
					content: currentValue,
					encoding: "utf-8",
					precondition:
						opts?.force || !currentRevision
							? undefined
							: { ifMatch: currentRevision },
				});

				entry.pendingSave = false;

				if (!result.ok) {
					if (result.reason === "conflict") {
						const diskContent = await fetchCurrentDiskContent(entry);
						entry.conflict = { diskContent };
						entry.hasExternalChange = true;
						notify(entry);
						return { status: "conflict", diskContent };
					}
					notify(entry);
					return { status: result.reason };
				}

				if (entry.content.kind === "text") {
					entry.content = {
						...entry.content,
						revision: result.revision,
					};
				}
				entry.savedContentText = currentValue;
				entry.conflict = null;
				entry.hasExternalChange = false;
				notify(entry);
				return { status: "saved", revision: result.revision };
			} catch (error) {
				entry.pendingSave = false;
				entry.saveError = error as Error;
				notify(entry);
				return { status: "error", error: error as Error };
			}
		},
		async reload() {
			resetForLoad(entry);
			notify(entry);
			await loadEntry(entry);
		},
		async loadUnlimited() {
			resetForLoad(entry);
			notify(entry);
			await loadEntry(entry, { unlimited: true });
		},
		async resolveConflict(choice: ConflictResolution) {
			if (!entry.conflict) return;
			if (choice === "reload") {
				await this.reload();
				return;
			}
			if (choice === "overwrite") {
				entry.conflict = null;
				notify(entry);
				await this.save({ force: true });
				return;
			}
			// keep — dismiss the dialog; buffer stays dirty against stale revision
			entry.conflict = null;
			notify(entry);
		},
		clearSaveError() {
			if (entry.saveError === null) return;
			entry.saveError = null;
			notify(entry);
		},
		subscribe(listener) {
			entry.subscribers.add(listener);
			return () => {
				entry.subscribers.delete(listener);
			};
		},
		getVersion() {
			return entry.version;
		},
	};
}

export function acquireDocument(
	workspaceId: string,
	absolutePath: string,
	trpcClient: WorkspaceTrpcClient,
): SharedFileDocument {
	const k = key(workspaceId, absolutePath);
	let entry = entries.get(k);
	if (!entry) {
		entry = {
			id: crypto.randomUUID(),
			workspaceId,
			absolutePath,
			trpcClient,
			content: { kind: "loading" },
			savedContentText: null,
			pendingSave: false,
			saveError: null,
			conflict: null,
			orphaned: false,
			hasExternalChange: false,
			isBinary: null,
			byteSize: null,
			refCount: 0,
			version: 0,
			subscribers: new Set(),
		};
		entries.set(k, entry);
		void loadEntry(entry);
	}
	entry.refCount += 1;
	return createHandle(entry);
}

export function releaseDocument(
	workspaceId: string,
	absolutePath: string,
): void {
	const k = key(workspaceId, absolutePath);
	const entry = entries.get(k);
	if (!entry) return;
	entry.refCount -= 1;
	if (entry.refCount <= 0 && !computeDirty(entry) && !entry.orphaned) {
		entries.delete(k);
	}
}

export function getDocument(
	workspaceId: string,
	absolutePath: string,
): SharedFileDocument | null {
	const entry = entries.get(key(workspaceId, absolutePath));
	if (!entry) return null;
	return createHandle(entry);
}

/**
 * Reacts to a workspace file-system event. Called by FileDocumentStoreProvider
 * from its `useWorkspaceEvent("fs:events", ...)` subscription.
 *
 * The @parcel/watcher layer under `packages/workspace-fs/src/watch.ts` already
 * coalesces rapid-fire events and pairs delete+create sequences into rename
 * events, so a "delete" event here is a real delete — no additional debounce
 * is required.
 */
export function dispatchFsEvent(
	workspaceId: string,
	event: FsWatchEvent,
): void {
	// Snapshot before iterating — the rename branch below does entries.delete +
	// entries.set on the same map, and JS Map iterators visit keys inserted
	// mid-iteration, which would revisit the same entry and loop forever.
	for (const entry of Array.from(entries.values())) {
		if (entry.workspaceId !== workspaceId) continue;
		const affects =
			entry.absolutePath === event.absolutePath ||
			(event.kind === "rename" && event.oldAbsolutePath === entry.absolutePath);
		if (!affects) continue;

		const isContentMutation =
			event.kind === "create" ||
			event.kind === "update" ||
			event.kind === "overflow" ||
			(event.kind === "rename" && event.absolutePath === entry.absolutePath);

		if (event.kind === "delete") {
			entry.orphaned = true;
			notify(entry);
			continue;
		}

		if (
			event.kind === "rename" &&
			event.oldAbsolutePath === entry.absolutePath
		) {
			const oldKey = key(entry.workspaceId, entry.absolutePath);
			entries.delete(oldKey);
			entry.absolutePath = event.absolutePath;
			entries.set(key(entry.workspaceId, entry.absolutePath), entry);
			notify(entry);
			continue;
		}

		if (isContentMutation) {
			if (entry.orphaned) entry.orphaned = false;
			if (computeDirty(entry)) {
				entry.hasExternalChange = true;
				notify(entry);
			} else {
				void loadEntry(entry);
			}
		}
	}
}
