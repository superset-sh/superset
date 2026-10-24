import { renameSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { ATTACHMENT_RETENTION_DAYS } from "@superset/shared/attachment-limits";
import {
	FILE_ID_INDEX_DIR,
	getAttachmentsRoot,
	readAttachmentMetadata,
	unindexAttachmentFileId,
	writeAttachmentMetadata,
} from "./storage";

const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEPING_PREFIX = ".sweeping-";

export const ATTACHMENT_SWEEP_INTERVAL_MS = DAY_MS;

/**
 * Removes store entries nobody has used for `retentionDays`. An entry from
 * before `lastUsedAt` existed is stamped now instead, so it gets the full
 * retention from the first sweep.
 */
export async function sweepAttachmentStore({
	now = Date.now(),
	retentionDays = ATTACHMENT_RETENTION_DAYS,
	baseDirOverride,
}: {
	now?: number;
	retentionDays?: number;
	baseDirOverride?: string;
} = {}): Promise<{ removed: string[] }> {
	const root = getAttachmentsRoot(baseDirOverride);
	const entries = await readdir(root).catch(() => [] as string[]);
	const removed: string[] = [];
	for (const entry of entries) {
		if (entry.startsWith(SWEEPING_PREFIX)) {
			await rm(join(root, entry), { recursive: true, force: true });
			continue;
		}
		if (entry === FILE_ID_INDEX_DIR) continue;
		const doomed = claimIfUnused(entry, {
			cutoff: now - retentionDays * DAY_MS,
			now,
			root,
			baseDirOverride,
		});
		if (!doomed) continue;
		await rm(doomed, { recursive: true, force: true });
		removed.push(entry);
	}
	return { removed };
}

/**
 * Synchronous from the metadata read to the rename, so a hand-out on this
 * event loop can't run between the check and the removal. Once renamed, the
 * entry is unreachable by id, and the slow delete can run async.
 */
function claimIfUnused(
	attachmentId: string,
	{
		cutoff,
		now,
		root,
		baseDirOverride,
	}: { cutoff: number; now: number; root: string; baseDirOverride?: string },
): string | null {
	const metadata = readAttachmentMetadata(attachmentId, baseDirOverride);
	if (!metadata) return null;
	if (metadata.lastUsedAt === undefined) {
		writeAttachmentMetadata({ ...metadata, lastUsedAt: now }, baseDirOverride);
		return null;
	}
	if (metadata.lastUsedAt >= cutoff) return null;
	unindexAttachmentFileId(metadata, baseDirOverride);
	const doomed = join(root, `${SWEEPING_PREFIX}${attachmentId}`);
	renameSync(join(root, attachmentId), doomed);
	return doomed;
}
