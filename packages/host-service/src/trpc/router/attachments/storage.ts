import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import mimeTypes from "mime-types";

export interface AttachmentMetadata {
	attachmentId: string;
	mediaType: string;
	originalFilename?: string;
	sizeBytes: number;
	createdAt: number;
}

/**
 * Resolves the per-org attachment storage root. Honors
 * `HOST_MANIFEST_DIR` (set by host-service-coordinator with the active
 * org id baked in) so attachments live alongside that org's `host.db`.
 * Falls back to `~/.superset/host/standalone` when the host service is
 * run outside the desktop coordinator.
 *
 * Override with `baseDirOverride` in tests.
 */
export function getAttachmentsRoot(baseDirOverride?: string): string {
	if (baseDirOverride) return join(baseDirOverride, "attachments");
	const envBase = process.env.HOST_MANIFEST_DIR?.trim();
	const base =
		envBase && envBase.length > 0
			? envBase
			: join(homedir(), ".superset", "host", "standalone");
	return join(base, "attachments");
}

export function getAttachmentDir(
	attachmentId: string,
	baseDirOverride?: string,
): string {
	return join(getAttachmentsRoot(baseDirOverride), attachmentId);
}

export function getAttachmentFilePath(
	attachmentId: string,
	mediaType: string,
	baseDirOverride?: string,
): string {
	const ext = mimeTypes.extension(mediaType);
	if (!ext) {
		throw new Error(`Unsupported media type: ${mediaType}`);
	}
	return join(
		getAttachmentDir(attachmentId, baseDirOverride),
		`${attachmentId}.${ext}`,
	);
}

export function getAttachmentMetadataPath(
	attachmentId: string,
	baseDirOverride?: string,
): string {
	return join(getAttachmentDir(attachmentId, baseDirOverride), "metadata.json");
}

export function writeAttachment(
	bytes: Uint8Array,
	metadata: AttachmentMetadata,
	baseDirOverride?: string,
): void {
	const dir = getAttachmentDir(metadata.attachmentId, baseDirOverride);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	writeFileSync(
		getAttachmentFilePath(
			metadata.attachmentId,
			metadata.mediaType,
			baseDirOverride,
		),
		bytes,
		{ mode: 0o600 },
	);
	writeFileSync(
		getAttachmentMetadataPath(metadata.attachmentId, baseDirOverride),
		JSON.stringify(metadata, null, 2),
		{ mode: 0o600 },
	);
}

export function deleteAttachment(
	attachmentId: string,
	baseDirOverride?: string,
): void {
	const dir = getAttachmentDir(attachmentId, baseDirOverride);
	rmSync(dir, { recursive: true, force: true });
}
