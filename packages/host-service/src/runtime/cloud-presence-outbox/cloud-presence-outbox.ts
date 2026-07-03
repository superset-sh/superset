import { getHostId, getHostName } from "@superset/shared/host-info";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../db";
import { cloudPresenceOutbox, workspaces } from "../../db/schema";
import type { ApiClient } from "../../types";

export type PresenceOp = "create" | "delete";

// Records a cloud presence mirror that must be retried later. Called when a
// local-first create/delete commits but its cloud mirror fails — without
// this, other machines miss the workspace (or keep showing a ghost). See
// schema.ts for why this is an outbox and not an inference sweep.
export function enqueueCloudPresence(
	db: HostDb,
	workspaceId: string,
	op: PresenceOp,
): void {
	db.insert(cloudPresenceOutbox)
		.values({ workspaceId, op })
		// The latest local action wins: a delete supersedes a pending create.
		.onConflictDoUpdate({
			target: cloudPresenceOutbox.workspaceId,
			set: { op },
		})
		.run();
}

export interface FlushResult {
	flushed: number;
	dropped: number;
	pending: number;
}

// Cloud rejected the mirror itself (not the transport) — retrying the same
// payload can never succeed, so the entry is dropped with a warning.
function isUnrecoverable(err: unknown): boolean {
	const code = errCode(err);
	return (
		code === "CONFLICT" ||
		code === "BAD_REQUEST" ||
		code === "FORBIDDEN" ||
		code === "PRECONDITION_FAILED"
	);
}

function errCode(err: unknown): string | undefined {
	return (err as { data?: { code?: string } })?.data?.code;
}

// Retries every queued presence mirror. Deletes: NOT_FOUND counts as success.
// Creates: re-read the local row (it is the truth); if it's gone the entry is
// obsolete. Transport/server failures stay queued for the next flush.
export async function flushCloudPresenceOutbox(
	db: HostDb,
	api: ApiClient,
	organizationId: string,
): Promise<FlushResult> {
	const rows = db.select().from(cloudPresenceOutbox).all();
	if (rows.length === 0) return { flushed: 0, dropped: 0, pending: 0 };

	// Creates need the cloud host row (v2_workspaces host FK). Idempotent; if
	// this fails we're offline — leave everything queued.
	if (rows.some((row) => row.op === "create")) {
		try {
			await api.host.ensure.mutate({
				organizationId,
				machineId: getHostId(),
				name: getHostName(),
			});
		} catch {
			return { flushed: 0, dropped: 0, pending: rows.length };
		}
	}

	let flushed = 0;
	let dropped = 0;
	for (const row of rows) {
		const remove = () =>
			db
				.delete(cloudPresenceOutbox)
				.where(eq(cloudPresenceOutbox.workspaceId, row.workspaceId))
				.run();
		try {
			if (row.op === "delete") {
				await api.v2Workspace.delete.mutate({ id: row.workspaceId });
				flushed += 1;
				remove();
				continue;
			}
			const local = db.query.workspaces
				.findFirst({ where: eq(workspaces.id, row.workspaceId) })
				.sync();
			if (!local) {
				dropped += 1;
				remove();
				continue;
			}
			const cloudRow = await api.v2Workspace.create.mutate({
				organizationId: local.organizationId ?? organizationId,
				projectId: local.projectId,
				name: local.name ?? local.branch,
				branch: local.branch,
				hostId: getHostId(),
				type: local.type ?? "worktree",
				taskId: local.taskId ?? undefined,
				id: local.id,
			});
			// Backfill audit identity the offline create couldn't know.
			if (cloudRow?.createdByUserId && !local.createdByUserId) {
				db.update(workspaces)
					.set({ createdByUserId: cloudRow.createdByUserId })
					.where(eq(workspaces.id, local.id))
					.run();
			}
			flushed += 1;
			remove();
		} catch (err) {
			if (row.op === "delete" && errCode(err) === "NOT_FOUND") {
				flushed += 1;
				remove();
				continue;
			}
			if (isUnrecoverable(err)) {
				console.warn("[cloud-presence-outbox] dropping unrecoverable entry", {
					workspaceId: row.workspaceId,
					op: row.op,
					code: errCode(err),
				});
				dropped += 1;
				remove();
			}
		}
	}
	return { flushed, dropped, pending: rows.length - flushed - dropped };
}
