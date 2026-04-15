import Dexie, { type Table } from "dexie";

/**
 * IndexedDB store for pending workspace attachment blobs. Keyed by
 * `${pendingId}/${uuid}` so we can prefix-query all blobs belonging
 * to a single pending row on retry or cleanup.
 *
 * Dexie handles transaction lifecycle — no manual tx.complete waits,
 * no "transaction has finished" footguns.
 */

interface StoredAttachment {
	key: string; // pendingId/uuid
	blob: Blob;
	mediaType: string;
	filename: string;
}

class PendingAttachmentsDb extends Dexie {
	attachments!: Table<StoredAttachment, string>;

	constructor() {
		super("superset-pending-attachments");
		this.version(1).stores({
			attachments: "&key", // primary key only
		});
	}
}

const db = new PendingAttachmentsDb();

/**
 * Store attachment blobs from the PromptInput.
 * Call before closing the modal so blobs survive for retry.
 */
export async function storeAttachments(
	pendingId: string,
	files: Array<{ url: string; mediaType: string; filename?: string }>,
): Promise<void> {
	if (files.length === 0) return;

	const resolved = await Promise.all(
		files.map(async (file) => {
			const response = await fetch(file.url);
			if (!response.ok) {
				throw new Error(
					`Failed to fetch attachment: ${response.status} ${response.statusText}`,
				);
			}
			const blob = await response.blob();
			return {
				key: `${pendingId}/${crypto.randomUUID()}`,
				blob,
				mediaType: file.mediaType,
				filename: file.filename ?? "attachment",
			} satisfies StoredAttachment;
		}),
	);

	await db.attachments.bulkPut(resolved);
}

/**
 * Load stored attachment blobs and convert them to data URLs
 * for the API payload. Used on retry.
 */
export async function loadAttachments(
	pendingId: string,
): Promise<Array<{ data: string; mediaType: string; filename: string }>> {
	const prefix = `${pendingId}/`;
	const entries = await db.attachments
		.where("key")
		.startsWith(prefix)
		.toArray();

	return Promise.all(
		entries.map(async (entry) => ({
			data: await blobToDataUrl(entry.blob),
			mediaType: entry.mediaType,
			filename: entry.filename,
		})),
	);
}

/**
 * Delete all stored attachments for a pending workspace.
 * Call on create success or dismiss.
 */
export async function clearAttachments(pendingId: string): Promise<void> {
	const prefix = `${pendingId}/`;
	await db.attachments.where("key").startsWith(prefix).delete();
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}
