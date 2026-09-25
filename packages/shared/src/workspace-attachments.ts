/**
 * The workspace attachments convention: files a prompt references (launch
 * attachments, mobile composer picks, desktop terminal pastes/drops) are
 * written into this directory inside the worktree, and agents receive
 * worktree-relative paths — so the paths read the same to the agent as to
 * the user.
 *
 * The naming here is a correctness coupling, not a style choice: the writer
 * (e.g. the desktop terminal adapter) and the prompt renderer (e.g.
 * `agent-launch-request.ts`) must produce byte-identical names for the same
 * input list, or the prompt points at files that don't exist. Every surface
 * must go through these helpers rather than reimplementing them.
 */

/** Worktree-relative directory attachments are written into. */
export const WORKSPACE_ATTACHMENTS_DIR = ".superset/attachments";

/**
 * Reduce an untrusted filename (clipboard, picker, upload) to a shell- and
 * path-safe charset. Returns null when nothing usable survives (e.g. "!!!"),
 * so callers fall back to a generated name.
 */
export function sanitizeAttachmentFileName(
	raw: string | null | undefined,
): string | null {
	const sanitized = (raw ?? "").replace(/[^a-zA-Z0-9._-]/g, "_");
	if (!sanitized.trim()) return null;
	// "." and ".." survive the charset but name the directory itself or its
	// parent, not a file — send those to the generated-name fallback.
	if (sanitized === "." || sanitized === "..") return null;
	return sanitized;
}

/** Generated name for an attachment with no usable filename (1-based). */
export function attachmentFallbackName(index: number, extension = ""): string {
	return `attachment_${index + 1}${extension}`;
}

/**
 * The nth candidate name for a base: the base itself, then `stem_n.ext`.
 * The extension splits on the last dot only when it isn't leading, so
 * ".bashrc" suffixes to ".bashrc_1", not "_1.bashrc".
 */
export function attachmentNameWithSuffix(
	base: string,
	attempt: number,
): string {
	if (attempt === 0) return base;
	const dot = base.lastIndexOf(".");
	if (dot <= 0) return `${base}_${attempt}`;
	return `${base.slice(0, dot)}_${attempt}${base.slice(dot)}`;
}

/**
 * Assign a collision-free name within one batch, recording it in `used`.
 * Deterministic for a given input list — writers and prompt renderers call
 * this with the same list and get the same names.
 *
 * Batch-local only: it cannot see files already on disk. Surfaces where a
 * later batch must not overwrite an earlier one (terminal paste) probe the
 * real directory with `attachmentNameWithSuffix` and create-only writes
 * instead.
 */
export function assignAttachmentFileName(input: {
	rawName: string | null | undefined;
	index: number;
	used: Set<string>;
	/** Appended to generated names, dot included (e.g. ".png"). */
	fallbackExtension?: string;
}): string {
	const base =
		sanitizeAttachmentFileName(input.rawName) ??
		attachmentFallbackName(input.index, input.fallbackExtension ?? "");
	for (let attempt = 0; ; attempt++) {
		const candidate = attachmentNameWithSuffix(base, attempt);
		// Case-insensitive: on APFS/NTFS "image.png" and "Image.png" are the
		// same path, and a same-batch collision would silently overwrite while
		// the prompt lists two names.
		const key = candidate.toLowerCase();
		if (!input.used.has(key)) {
			input.used.add(key);
			return candidate;
		}
	}
}
