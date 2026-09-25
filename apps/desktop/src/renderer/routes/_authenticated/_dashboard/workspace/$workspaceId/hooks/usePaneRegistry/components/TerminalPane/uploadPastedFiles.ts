import {
	attachmentFallbackName,
	attachmentNameWithSuffix,
	sanitizeAttachmentFileName,
	WORKSPACE_ATTACHMENTS_DIR,
} from "@superset/shared/workspace-attachments";
import { fileToBase64 } from "renderer/lib/file-to-base64";

// Pastes follow the shared workspace-attachments convention (same directory
// and naming as agent-launch and the mobile composer): worktree-relative
// paths, since `filesystem.writeFile` refuses paths outside the worktree.
// The directory self-ignores (see the `.gitignore` write below) so
// attachments never dirty git status.

/** Collision-probe cap; matches the spirit of createUniqueEntry's bound. */
const MAX_NAME_ATTEMPTS = 50;

// Same caps as the agent-launch adapter's attachment writer. The bytes are
// FileReader-read and base64'd (~1.33x) in renderer memory, then travel as
// one JSON body — an accidentally pasted multi-GB Finder file must fail
// fast instead of stalling the renderer and the host.
const MAX_SINGLE_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

/** Thrown for limits the user can act on; the message is toast-ready. */
export class PasteUploadLimitError extends Error {}

function formatMb(bytes: number): string {
	return `${Math.round(bytes / 1024 / 1024)}MB`;
}

interface FsWriteOutcome {
	ok: boolean;
	reason?: string;
}

export interface UploadPastedFilesDeps {
	createDirectory(input: {
		workspaceId: string;
		absolutePath: string;
		recursive: boolean;
	}): Promise<unknown>;
	writeFile(input: {
		workspaceId: string;
		absolutePath: string;
		content: string | { kind: "base64"; data: string };
		options: { create: boolean; overwrite: boolean };
	}): Promise<FsWriteOutcome>;
}

const MIME_EXTENSIONS: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/svg+xml": "svg",
	"image/tiff": "tiff",
	"image/bmp": "bmp",
};

/**
 * Clipboard names (Chromium synthesizes "image.png" for screenshots; Finder
 * copies keep their real name) go through the shared sanitizer; generated
 * fallbacks take their extension from the mime type, the only signal a
 * clipboard file carries.
 */
function baseFileName(file: File, index: number): string {
	const sanitized = sanitizeAttachmentFileName(file.name);
	if (sanitized) return sanitized;
	const extension = MIME_EXTENSIONS[file.type];
	return attachmentFallbackName(index, extension ? `.${extension}` : "");
}

/**
 * Write one file under a collision-free name. The batch conventions dedupe
 * against an in-memory set; pastes arrive one at a time across a session, so
 * probe the real directory instead (create-only writes report "exists") —
 * a second screenshot must never overwrite a path an earlier prompt already
 * references.
 */
async function writeUnique(
	deps: UploadPastedFilesDeps,
	workspaceId: string,
	dirAbs: string,
	base: string,
	data: string,
): Promise<string> {
	for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
		const fileName = attachmentNameWithSuffix(base, attempt);
		const outcome = await deps.writeFile({
			workspaceId,
			absolutePath: `${dirAbs}/${fileName}`,
			content: { kind: "base64", data },
			options: { create: true, overwrite: false },
		});
		if (outcome.ok !== false) return fileName;
		if (outcome.reason !== "exists") {
			throw new Error(outcome.reason ?? "write failed");
		}
	}
	throw new Error(`Could not find a free name for ${base}`);
}

/**
 * Ship clipboard files to a workspace whose PTY runs on another machine and
 * return the worktree-relative paths written, ready to paste into the
 * terminal. Throws on the first failed write — the caller owns the error
 * surface.
 */
export async function uploadPastedFiles(options: {
	deps: UploadPastedFilesDeps;
	workspaceId: string;
	worktreePath: string;
	files: File[];
}): Promise<string[]> {
	const { deps, workspaceId, worktreePath, files } = options;
	const dirAbs = `${worktreePath}/${WORKSPACE_ATTACHMENTS_DIR}`;

	let totalBytes = 0;
	for (const file of files) {
		if (file.size > MAX_SINGLE_FILE_BYTES) {
			throw new PasteUploadLimitError(
				`"${file.name || "pasted file"}" is ${formatMb(file.size)} — files over ${formatMb(MAX_SINGLE_FILE_BYTES)} can't be sent to a remote workspace`,
			);
		}
		totalBytes += file.size;
	}
	if (totalBytes > MAX_TOTAL_BYTES) {
		throw new PasteUploadLimitError(
			`Pasted files total ${formatMb(totalBytes)} — more than the ${formatMb(MAX_TOTAL_BYTES)} limit for a remote workspace`,
		);
	}

	await deps.createDirectory({
		workspaceId,
		absolutePath: dirAbs,
		recursive: true,
	});

	// `*` ignores every attachment and the .gitignore itself, so agents never
	// see attachments as untracked changes. create-only: a user's own edit wins.
	const ignoreOutcome = await deps.writeFile({
		workspaceId,
		absolutePath: `${dirAbs}/.gitignore`,
		content: "*\n",
		options: { create: true, overwrite: false },
	});
	if (ignoreOutcome.ok === false && ignoreOutcome.reason !== "exists") {
		throw new Error(ignoreOutcome.reason ?? "write failed");
	}

	const paths: string[] = [];
	for (const [index, file] of files.entries()) {
		const data = await fileToBase64(file);
		const fileName = await writeUnique(
			deps,
			workspaceId,
			dirAbs,
			baseFileName(file, index),
			data,
		);
		paths.push(`${WORKSPACE_ATTACHMENTS_DIR}/${fileName}`);
	}
	return paths;
}
