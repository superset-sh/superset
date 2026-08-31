import { db } from "@superset/db/client";
import { files } from "@superset/db/schema";
import { fileOriginalKey } from "@superset/shared/usercontent";
import { and, eq, inArray, lt } from "drizzle-orm";
import { deleteObjects } from "../../lib/r2";

export const FILE_SWEEP_JOB_PATH = "/api/files/jobs/sweep";

const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SWEEP_BATCH = 500;

/**
 * Drops `pending` rows older than a day, and their objects. Rows first, and
 * only rows still `pending`: deleting the row is the claim that stops a
 * concurrent `complete` from flipping a swept file to `ready` (its guarded
 * update then matches nothing and the client starts over). A crash between
 * the row delete and the object delete strands at most one batch of
 * objects — acceptable against the alternative, a `ready` row whose bytes
 * the sweep already removed.
 */
export async function sweepPendingFiles(
	now = Date.now(),
): Promise<{ swept: number }> {
	const cutoff = new Date(now - PENDING_MAX_AGE_MS);
	const candidates = await db
		.select({ id: files.id })
		.from(files)
		.where(and(eq(files.status, "pending"), lt(files.createdAt, cutoff)))
		.limit(SWEEP_BATCH);
	if (candidates.length === 0) return { swept: 0 };

	const swept = await db
		.delete(files)
		.where(
			and(
				inArray(
					files.id,
					candidates.map((row) => row.id),
				),
				eq(files.status, "pending"),
			),
		)
		.returning({ id: files.id });
	if (swept.length > 0) {
		await deleteObjects(swept.map((row) => fileOriginalKey(row.id)));
	}
	return { swept: swept.length };
}
