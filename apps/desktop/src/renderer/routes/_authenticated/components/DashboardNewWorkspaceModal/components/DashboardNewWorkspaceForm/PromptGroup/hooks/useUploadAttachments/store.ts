import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

export type UploadState =
	| { kind: "pending" }
	| { kind: "ready"; attachmentId: string }
	| { kind: "error"; message: string };

interface UploadStoreState {
	// Outer key: fileId. Inner key: hostUrl. Nested so we can prune by
	// fileId without parsing a composite string key.
	entries: Record<string, Record<string, UploadState>>;
}

export const useAttachmentUploadsStore = create<UploadStoreState>(() => ({
	entries: {},
}));

// Promises live outside the store — they aren't serializable and aren't
// observed by React. Keyed identically to entries: outer fileId, inner hostUrl.
const promiseMap = new Map<string, Map<string, Promise<UploadState>>>();

async function fetchBase64(url: string): Promise<string> {
	if (url.startsWith("data:")) {
		const commaIndex = url.indexOf(",");
		if (commaIndex === -1) return "";
		return url.slice(commaIndex + 1);
	}
	const response = await fetch(url);
	const buffer = await response.arrayBuffer();
	let binary = "";
	const bytes = new Uint8Array(buffer);
	for (let i = 0; i < bytes.length; i += 1) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function setEntry(fileId: string, hostUrl: string, state: UploadState): void {
	useAttachmentUploadsStore.setState((s) => ({
		entries: {
			...s.entries,
			[fileId]: { ...(s.entries[fileId] ?? {}), [hostUrl]: state },
		},
	}));
}

export interface StartUploadInput {
	id: string;
	url: string;
	mediaType: string;
	filename?: string;
}

/**
 * Idempotent: if an upload for `(hostUrl, file.id)` is already in flight or
 * settled, this is a no-op. The store only persists the upload status —
 * filename/mediaType live in the prompt-input library and are joined at
 * read time by the hook.
 */
export function startUpload(hostUrl: string, file: StartUploadInput): void {
	let byHost = promiseMap.get(file.id);
	if (byHost?.has(hostUrl)) return;
	if (!byHost) {
		byHost = new Map();
		promiseMap.set(file.id, byHost);
	}

	setEntry(file.id, hostUrl, { kind: "pending" });

	const promise = (async (): Promise<UploadState> => {
		try {
			const data = await fetchBase64(file.url);
			const result = await getHostServiceClientByUrl(
				hostUrl,
			).attachments.upload.mutate({
				data: { kind: "base64", data },
				mediaType: file.mediaType,
				originalFilename: file.filename,
			});
			const next: UploadState = {
				kind: "ready",
				attachmentId: result.attachmentId,
			};
			setEntry(file.id, hostUrl, next);
			return next;
		} catch (err) {
			const next: UploadState = {
				kind: "error",
				message: err instanceof Error ? err.message : String(err),
			};
			setEntry(file.id, hostUrl, next);
			return next;
		}
	})();
	byHost.set(hostUrl, promise);
}

/**
 * Resolves once every requested `(hostUrl, fileId)` upload has settled.
 * Returns ready ids and failures keyed back to fileId so callers can join
 * with the prompt-input library's metadata for messaging.
 */
export async function awaitUploads(
	hostUrl: string,
	fileIds: string[],
): Promise<{
	readyIds: string[];
	failures: { fileId: string; message: string }[];
}> {
	const tasks: { fileId: string; promise: Promise<UploadState> }[] = [];
	for (const fileId of fileIds) {
		const promise = promiseMap.get(fileId)?.get(hostUrl);
		if (promise) tasks.push({ fileId, promise });
	}
	const settled = await Promise.all(tasks.map((t) => t.promise));
	const readyIds: string[] = [];
	const failures: { fileId: string; message: string }[] = [];
	settled.forEach((state, i) => {
		if (state.kind === "ready") readyIds.push(state.attachmentId);
		else if (state.kind === "error") {
			failures.push({ fileId: tasks[i].fileId, message: state.message });
		}
	});
	return { readyIds, failures };
}

/**
 * Subscribes to the upload status of a single `(fileId, hostUrl)` slice.
 * Each pill subscribes to its own slot, so unrelated upload state changes
 * don't trigger re-renders elsewhere in the modal.
 */
export function useUploadStateFor(
	fileId: string,
	hostUrl: string | null,
): UploadState | null {
	return useAttachmentUploadsStore((s) => {
		if (!hostUrl) return null;
		return s.entries[fileId]?.[hostUrl] ?? null;
	});
}

/**
 * Returns the file ids that have an upload entry under `hostUrl` — i.e. the
 * files attached *while* on that host. Used to filter the prompt-input
 * library's flat file list down to a per-host view: switching hosts hides
 * other hosts' files without revoking their blob URLs or upload state.
 */
export function useFileIdsForHost(hostUrl: string | null): string[] {
	return useAttachmentUploadsStore(
		useShallow((s) => {
			if (!hostUrl) return [];
			const ids: string[] = [];
			for (const [fileId, byHost] of Object.entries(s.entries)) {
				if (byHost[hostUrl]) ids.push(fileId);
			}
			return ids;
		}),
	);
}

/**
 * Drops cached upload state for any fileId not in `liveFileIds`. Called by
 * the hook on every re-render so the store stays a strict downstream of the
 * prompt-input library's `attachments.files` — clearing the library
 * automatically empties the store on the next effect tick.
 */
export function pruneAttachmentUploads(liveFileIds: Set<string>): void {
	for (const fileId of promiseMap.keys()) {
		if (!liveFileIds.has(fileId)) promiseMap.delete(fileId);
	}
	useAttachmentUploadsStore.setState((s) => {
		const next: Record<string, Record<string, UploadState>> = {};
		for (const [fileId, byHost] of Object.entries(s.entries)) {
			if (liveFileIds.has(fileId)) next[fileId] = byHost;
		}
		return { entries: next };
	});
}
