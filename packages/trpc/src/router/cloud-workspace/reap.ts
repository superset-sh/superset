import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { deleteSandbox, stopSandbox } from "../../lib/sandbox";
import { publishCloudWorkspaceJob } from "./jobs";

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

export async function reapArchivedCloudWorkspace(
	input: ReapArchivedCloudWorkspaceInput,
): Promise<"stopped" | "reaped" | "skipped"> {
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, input.cloudWorkspaceId),
	});
	if (
		!row ||
		row.status !== "deleted" ||
		row.deletedAt?.toISOString() !== input.archivedAt ||
		row.provider !== "vercel"
	) {
		return "skipped";
	}
	if (input.stage === "delete") {
		await deleteSandbox(row.providerSandboxId);
		return "reaped";
	}
	await stopSandbox(row.providerSandboxId);
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
