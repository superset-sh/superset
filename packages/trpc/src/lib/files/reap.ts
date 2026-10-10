import { db } from "@superset/db/client";
import { attachments, files, type SelectAttachment } from "@superset/db/schema";
import { fileOriginalKey } from "@superset/shared/usercontent";
import { and, eq, inArray } from "drizzle-orm";
import { deleteObjects } from "../r2";

/**
 * Drops the attachment rows of the named parents and returns the distinct
 * files they pointed at. `attachments.parentId` carries no foreign key (its
 * parent kind varies), so every parent's delete path has to call this for
 * the rows its cascade left behind — then hand the result to
 * `reapOrphanFiles`.
 */
export async function detachAll({
	parentKind,
	parentIds,
}: {
	parentKind: SelectAttachment["parentKind"];
	parentIds: string[];
}): Promise<string[]> {
	if (parentIds.length === 0) return [];
	const removed = await db
		.delete(attachments)
		.where(
			and(
				eq(attachments.parentKind, parentKind),
				inArray(attachments.parentId, parentIds),
			),
		)
		.returning({ fileId: attachments.fileId });
	return [...new Set(removed.map((row) => row.fileId))];
}

/**
 * Deletes the files among `fileIds` that no attachment references anymore,
 * bytes included. Objects go before rows: a crash in between leaves a row
 * pointing at nothing, which the next reap of that file repairs, whereas the
 * opposite order strands bytes nothing can name again.
 */
export async function reapOrphanFiles(fileIds: string[]): Promise<void> {
	if (fileIds.length === 0) return;
	const stillReferenced = new Set(
		(
			await db
				.select({ fileId: attachments.fileId })
				.from(attachments)
				.where(inArray(attachments.fileId, fileIds))
		).map((row) => row.fileId),
	);
	const orphans = fileIds.filter((id) => !stillReferenced.has(id));
	if (orphans.length === 0) return;
	await deleteObjects(orphans.map(fileOriginalKey));
	await db.delete(files).where(inArray(files.id, orphans));
}
