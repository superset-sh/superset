import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { workspaces } from "../db/schema";
import type { EventBus } from "../events";
import type { ApiClient } from "../types";

export interface WorkspaceBackfillContext {
	api: ApiClient;
	db: HostDb;
	eventBus: EventBus;
	organizationId: string;
}

/**
 * One-time-per-row backfill of the workspace fields that only existed in the
 * cloud before the host owned the table (name/type/taskId/createdByUserId/
 * timestamps). Targets rows with an empty `name`; steady-state boots are a
 * single indexed query and no cloud calls.
 *
 * Must run while the cloud table is still populated (R1/R2) — it is the only
 * source for these fields on pre-existing rows.
 *
 * Backfill ONLY fills; it never deletes. In the host-owned model the host is
 * the source of truth, so a row's validity is a local/disk question
 * (`worktreeExists`), not "does the cloud still remember it" — and a cloud
 * null is ambiguous (genuinely-deleted vs wrong-org/auth), so deleting on it
 * risks wiping every row on a misconfig. A cloud-missing row is simply left
 * as-is: it renders with its branch as the name and the user can destroy it.
 *
 * - Cloud row found  → copy fields, mark cloud-synced.
 * - Cloud row absent → leave the row untouched (retried next boot; harmless).
 * - Cloud unreachable → leave the row; retried on next boot.
 */
export async function runWorkspaceBackfill(
	ctx: WorkspaceBackfillContext,
): Promise<void> {
	const pending = ctx.db
		.select()
		.from(workspaces)
		.where(eq(workspaces.name, ""))
		.all();
	if (pending.length === 0) return;

	let filled = 0;
	for (const row of pending) {
		let cloud: Awaited<
			ReturnType<ApiClient["v2Workspace"]["getFromHost"]["query"]>
		>;
		try {
			cloud = await ctx.api.v2Workspace.getFromHost.query({
				organizationId: ctx.organizationId,
				id: row.id,
			});
		} catch (err) {
			// Skip rather than abort: one row with a persistent cloud error must
			// not starve the rest of the sweep. Unfilled rows retry next boot.
			console.warn(
				"[workspace-backfill] cloud lookup failed; retrying next boot",
				{ workspaceId: row.id, err },
			);
			continue;
		}

		// No cloud counterpart (or wrong-org null): leave it alone, never delete.
		if (!cloud) continue;

		ctx.db
			.update(workspaces)
			.set({
				name: cloud.name,
				type: cloud.type,
				taskId: cloud.taskId,
				createdByUserId: cloud.createdByUserId,
				createdAt: cloud.createdAt.getTime(),
				updatedAt: cloud.updatedAt.getTime(),
				cloudSyncedAt: Date.now(),
			})
			.where(eq(workspaces.id, row.id))
			.run();
		filled++;
	}
	console.log(`[workspace-backfill] backfilled ${filled} row(s)`);
}
