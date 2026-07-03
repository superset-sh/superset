import { eq } from "drizzle-orm";
import type { HostDb } from "../../db";
import { cloudDeleteOutbox } from "../../db/schema";
import type { ApiClient } from "../../types";

// Records a cloud presence delete that must be retried later. Called when a
// rollback's cloud delete fails — without this, other machines keep showing a
// workspace that no longer exists (see schema.ts for why this is an outbox
// and not an inference sweep).
export function enqueueCloudDelete(db: HostDb, workspaceId: string): void {
	db.insert(cloudDeleteOutbox)
		.values({ workspaceId })
		.onConflictDoNothing()
		.run();
}

export interface FlushResult {
	deleted: number;
	pending: number;
}

// Retries every queued cloud delete. NOT_FOUND counts as success (someone
// else already deleted it). Other failures stay queued for the next flush.
export async function flushCloudDeleteOutbox(
	db: HostDb,
	api: ApiClient,
): Promise<FlushResult> {
	const rows = db.select().from(cloudDeleteOutbox).all();
	let deleted = 0;
	for (const row of rows) {
		try {
			await api.v2Workspace.delete.mutate({ id: row.workspaceId });
			deleted += 1;
		} catch (err) {
			const code = (err as { data?: { code?: string } })?.data?.code;
			if (code !== "NOT_FOUND") continue;
			deleted += 1;
		}
		db.delete(cloudDeleteOutbox)
			.where(eq(cloudDeleteOutbox.workspaceId, row.workspaceId))
			.run();
	}
	return { deleted, pending: rows.length - deleted };
}
