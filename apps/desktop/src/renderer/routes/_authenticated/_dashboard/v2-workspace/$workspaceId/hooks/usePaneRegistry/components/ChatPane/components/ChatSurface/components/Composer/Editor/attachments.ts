/**
 * Pending attachment shape + pure helpers for the Tiptap composer's
 * paste/drop flow. Images land here as base64 + mime so the submit
 * path can forward them as `payload.files` in the legacy sendMessage
 * shape.
 */

export interface PendingAttachment {
	/** Client-side id, for keying + remove. */
	id: string;
	/** Raw base64 (no "data:...;base64," prefix). */
	data: string;
	/** "image/png", "image/jpeg", etc. */
	mediaType: string;
	/** Optional original filename from the File System. */
	filename?: string;
	/** Byte size, for display. */
	sizeBytes: number;
}

/** Strip the `data:<mime>;base64,` prefix if present. */
export function stripDataUrlPrefix(s: string): string {
	const comma = s.indexOf(",");
	if (comma < 0) return s;
	const head = s.slice(0, comma);
	if (/^data:[^;]*;base64$/.test(head)) return s.slice(comma + 1);
	return s;
}

export function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result === "string") resolve(stripDataUrlPrefix(result));
			else reject(new Error("FileReader returned non-string"));
		};
		reader.onerror = () => reject(reader.error ?? new Error("read failed"));
		reader.readAsDataURL(blob);
	});
}

export function newAttachmentId(): string {
	return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
