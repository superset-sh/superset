import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AttachmentFile } from "@superset/launch-context";

const WORKTREE_ATTACHMENTS_SUBDIR = ".superset/attachments";

/**
 * Writes pre-resolved AttachmentFile bytes into
 * `<worktree>/.superset/attachments/<filename>`. Filenames are
 * expected to already be collision-safe (assigned by
 * `buildAgentLaunch`'s `assignFilenamesAndCollect`). Creates the
 * target dir if missing. No-op for an empty list.
 */
export function writeAttachmentsToWorktree(
	worktreePath: string,
	attachments: AttachmentFile[],
): void {
	if (attachments.length === 0) return;
	const dir = join(worktreePath, WORKTREE_ATTACHMENTS_SUBDIR);
	mkdirSync(dir, { recursive: true });
	for (const attachment of attachments) {
		const filename = attachment.filename ?? "attachment";
		writeFileSync(join(dir, filename), attachment.data);
	}
}
