import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { workspaces } from "../db/schema";
import type { EventBus } from "../events";
import type { ApiClient } from "../types";
import { deleteLocalWorkspace } from "../workspaces/local-workspace-store";

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
 * - Cloud row found  → copy fields, mark cloud-synced.
 * - Cloud row absent → the local row was stale under the old semantics
 *   (cloud was authoritative when it was written); drop it.
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
	let dropped = 0;
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
			console.warn(
				"[workspace-backfill] cloud unreachable; retrying next boot",
				{ workspaceId: row.id, err },
			);
			return;
		}

		if (!cloud) {
			deleteLocalWorkspace({ db: ctx.db, eventBus: ctx.eventBus }, row.id, {
				queueCloudDelete: false,
			});
			dropped++;
			continue;
		}

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
	console.log(
		`[workspace-backfill] backfilled ${filled} row(s), dropped ${dropped} stale row(s)`,
	);
}
