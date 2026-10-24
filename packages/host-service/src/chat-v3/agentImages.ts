import { createHash } from "node:crypto";
import {
	closeSync,
	constants,
	existsSync,
	fstatSync,
	mkdirSync,
	openSync,
	readSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, extname, join } from "node:path";
import type {
	AcpImageSource,
	AcpImageStoreContext,
	AcpStoredImage,
} from "@superset/chat-runtime";
import { MAX_CHAT_IMAGE_BYTES } from "@superset/shared/attachment-limits";
import {
	sanitizeAttachmentFileName,
	WORKSPACE_ATTACHMENTS_DIR,
} from "@superset/shared/workspace-attachments";
import mimeTypes from "mime-types";
import { ensureWorkspaceAttachmentsDir } from "../runtime/workspace-attachments-dir";

const NAME_HASH_CHARS = 12;

function extensionFor(mimeType: string, name: string | undefined): string {
	const fromName = name ? extname(name).slice(1).toLowerCase() : "";
	if (fromName) return fromName;
	return mimeTypes.extension(mimeType) || "img";
}

function stemFor(name: string | undefined): string {
	const sanitized = name
		? sanitizeAttachmentFileName(basename(name, extname(name)))
		: null;
	return sanitized ?? "image";
}

function isUsableFile(path: string, maxBytes: number): boolean {
	try {
		const stat = statSync(path);
		return stat.isFile() && stat.size > 0 && stat.size <= maxBytes;
	} catch {
		return false;
	}
}

function readBoundedFile(path: string, maxBytes: number): Uint8Array | null {
	if (!isUsableFile(path, maxBytes)) return null;
	let fd: number | undefined;
	try {
		fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
		const stat = fstatSync(fd);
		if (!stat.isFile() || stat.size === 0 || stat.size > maxBytes) return null;
		const bytes = new Uint8Array(stat.size);
		let offset = 0;
		while (offset < bytes.length) {
			const read = readSync(fd, bytes, offset, bytes.length - offset, offset);
			if (read === 0) break;
			offset += read;
		}
		if (readSync(fd, new Uint8Array(1), 0, 1, offset) > 0) return null;
		return bytes.subarray(0, offset);
	} catch {
		return null;
	} finally {
		if (fd !== undefined) closeSync(fd);
	}
}

function storeImage(
	source: AcpImageSource,
	cwd: string,
	maxBytes: number,
): AcpStoredImage | null {
	const bytes =
		source.kind === "bytes"
			? source.bytes
			: readBoundedFile(source.path, maxBytes);
	if (!bytes || bytes.byteLength === 0 || bytes.byteLength > maxBytes)
		return null;
	const name =
		source.kind === "file" ? (source.name ?? source.path) : source.name;
	const hash = createHash("sha256")
		.update(bytes)
		.digest("hex")
		.slice(0, NAME_HASH_CHARS);
	const fileName = `${stemFor(name)}-${hash}.${extensionFor(source.mimeType, name)}`;
	const target = join(ensureWorkspaceAttachmentsDir(cwd), fileName);
	if (!existsSync(target)) writeFileSync(target, bytes);
	return { path: `${WORKSPACE_ATTACHMENTS_DIR}/${fileName}` };
}

export function storeAgentImage(
	source: AcpImageSource,
	cwd: string,
	context?: AcpImageStoreContext,
	maxBytes = MAX_CHAT_IMAGE_BYTES,
): AcpStoredImage | null {
	const dir = join(cwd, WORKSPACE_ATTACHMENTS_DIR);
	const referenceDir = join(dir, ".image-references");
	const referencePath =
		source.kind === "file" && context
			? join(
					referenceDir,
					`${createHash("sha256")
						.update(
							JSON.stringify([
								context.sessionId,
								context.referenceId,
								source.path,
							]),
						)
						.digest("hex")}.json`,
				)
			: null;
	if (referencePath && context?.replaying) {
		const bytes = readBoundedFile(referencePath, 4096);
		if (bytes) {
			try {
				const fileName: unknown = JSON.parse(
					Buffer.from(bytes).toString("utf8"),
				);
				if (
					typeof fileName === "string" &&
					basename(fileName) === fileName &&
					isUsableFile(join(dir, fileName), maxBytes)
				) {
					return { path: `${WORKSPACE_ATTACHMENTS_DIR}/${fileName}` };
				}
			} catch {}
		}
	}
	const stored = storeImage(source, cwd, maxBytes);
	if (stored && referencePath) {
		ensureWorkspaceAttachmentsDir(cwd);
		mkdirSync(referenceDir, { recursive: true });
		writeFileSync(referencePath, JSON.stringify(basename(stored.path)));
	}
	return stored;
}
