import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import {
	deleteSandbox,
	describeSandbox,
	rerunBoxStartHook,
	runBoxArchiveHook,
	sandboxHostSecretFor,
	stopSandbox,
} from "../../lib/sandbox";
import { publishCloudWorkspaceJob } from "./jobs";
import { queueSettleWorkspace, settleWorkspaceNow } from "./meter";

/** How long an archived workspace keeps its box running, so an undo finds it live. */
export const ARCHIVE_STOP_DELAY_SECONDS = 60;
/** How long an archived workspace keeps its stopped box for an unarchive to resume. */
export const ARCHIVE_GRACE_SECONDS = 7 * 24 * 60 * 60;

export interface ReapArchivedCloudWorkspaceInput {
	cloudWorkspaceId: string;
	/** The archive this reap belongs to; a later archive queues its own. */
	archivedAt: string;
	stage: "stop" | "delete";
}

type CloudWorkspaceRow = typeof cloudWorkspaces.$inferSelect;

function isStillArchived(
	row: CloudWorkspaceRow | undefined,
	input: ReapArchivedCloudWorkspaceInput,
): row is CloudWorkspaceRow {
	return (
		row !== undefined &&
		row.status === "deleted" &&
		row.deletedAt?.toISOString() === input.archivedAt &&
		row.provider === "vercel"
	);
}

function findRow(id: string) {
	return db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, id),
	});
}

/**
 * Runs the repository's cloud `[archive]` on the still-running box, so what
 * its `setup` created outside the box is released. Best effort: the stop
 * goes ahead whatever happens. Returns false when the workspace was
 * unarchived while the hook ran, so the caller must not stop the box.
 */
async function runArchiveHook(
	row: CloudWorkspaceRow,
	input: ReapArchivedCloudWorkspaceInput,
): Promise<boolean> {
	const box = await describeSandbox(row.providerSandboxId).catch(() => null);
	if (!box?.running) return true;
	const hostSecret = await sandboxHostSecretFor(row.id);
	const outcome = await runBoxArchiveHook({
		hostTarget: box.hostTarget,
		hostSecret,
	});
	if (outcome.kind === "error") {
		console.error(`[cloud-workspace] ${row.id} archive hook`, outcome.message);
	} else if (outcome.kind === "ran" && outcome.status !== "skipped") {
		console.log(`[cloud-workspace] ${row.id} archive hook ${outcome.status}`);
	}
	if (isStillArchived(await findRow(row.id), input)) return true;
	// Undone mid-hook: setup re-creates what the hook released.
	const rerun = await rerunBoxStartHook({
		hostTarget: box.hostTarget,
		hostSecret,
	});
	if (rerun.kind === "error") {
		console.error(`[cloud-workspace] ${row.id} setup re-run`, rerun.message);
	}
	return false;
}

export async function reapArchivedCloudWorkspace(
	input: ReapArchivedCloudWorkspaceInput,
): Promise<"stopped" | "reaped" | "skipped"> {
	const row = await findRow(input.cloudWorkspaceId);
	if (!isStillArchived(row, input)) {
		return "skipped";
	}
	if (input.stage === "delete") {
		await settleWorkspaceNow(row.id).catch((error) =>
			console.error(`[cloud-workspace] ${row.id} final settle failed`, error),
		);
		await deleteSandbox(row.providerSandboxId);
		return "reaped";
	}
	if (!(await runArchiveHook(row, input))) return "skipped";
	await stopSandbox(row.providerSandboxId);
	await queueSettleWorkspace(row.id);
	return "stopped";
}

function queueReapStage(
	input: ReapArchivedCloudWorkspaceInput,
	delaySeconds: number,
): Promise<void> {
	return publishCloudWorkspaceJob({
		path: "/api/cloud-workspaces/reap",
		body: input,
		delaySeconds,
		runLocally: reapArchivedCloudWorkspace,
	});
}

/**
 * Stops the box after a short delay, and deletes it once the grace period is over.
 * Throws only when the delete could not be queued; a stop that could not be
 * queued happens now instead.
 */
export async function queueReap(
	input: Omit<ReapArchivedCloudWorkspaceInput, "stage">,
	providerSandboxId: string,
): Promise<void> {
	await queueReapStage({ ...input, stage: "delete" }, ARCHIVE_GRACE_SECONDS);
	await queueReapStage(
		{ ...input, stage: "stop" },
		ARCHIVE_STOP_DELAY_SECONDS,
	).catch(async (error) => {
		console.error(
			`[cloud-workspace] could not queue the stop for ${input.cloudWorkspaceId}`,
			error,
		);
		await stopSandbox(providerSandboxId);
	});
}
