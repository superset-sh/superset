import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
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
	const path = prepareAttachmentTarget(metadata, baseDirOverride);
	writeFileSync(path, bytes, { mode: 0o600 });
	writeAttachmentMetadata(metadata, baseDirOverride);
}

/**
 * The attachment's directory, created, and where its bytes belong. Split out
 * so a download can stream into that path instead of buffering a whole file
 * in memory the way `writeAttachment` does.
 */
export function prepareAttachmentTarget(
	metadata: AttachmentMetadata,
	baseDirOverride?: string,
): string {
	const dir = getAttachmentDir(metadata.attachmentId, baseDirOverride);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	return getAttachmentFilePath(
		metadata.attachmentId,
		metadata.mediaType,
		baseDirOverride,
	);
}

/**
 * Written last, after the bytes are down: `resolveAttachmentPath` reads the
 * metadata first and then checks the file, so a metadata file that appears
 * before a complete download would name a path that is still being written.
 */
export function writeAttachmentMetadata(
	metadata: AttachmentMetadata,
	baseDirOverride?: string,
): void {
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

export function readAttachmentMetadata(
	attachmentId: string,
	baseDirOverride?: string,
): AttachmentMetadata | null {
	const path = getAttachmentMetadataPath(attachmentId, baseDirOverride);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as AttachmentMetadata;
	} catch {
		return null;
	}
}

/**
 * Resolves an attachment id to its on-disk file path, or null when missing.
 * Used by agents.run to materialize host-readable paths in the prompt
 * attachment block. Renderer never sees these paths.
 */
export function resolveAttachmentPath(
	attachmentId: string,
	baseDirOverride?: string,
): { path: string; metadata: AttachmentMetadata } | null {
	const metadata = readAttachmentMetadata(attachmentId, baseDirOverride);
	if (!metadata) return null;
	const path = getAttachmentFilePath(
		attachmentId,
		metadata.mediaType,
		baseDirOverride,
	);
	return existsSync(path) ? { path, metadata } : null;
}
