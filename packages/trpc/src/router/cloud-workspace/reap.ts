import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { deleteSandbox } from "../../lib/sandbox";
import { publishCloudWorkspaceJob } from "./jobs";

/** How long an archived workspace keeps its stopped box for an unarchive to resume. */
export const ARCHIVE_GRACE_SECONDS = 7 * 24 * 60 * 60;

export interface ReapArchivedCloudWorkspaceInput {
	cloudWorkspaceId: string;
	/** The archive this reap belongs to; a later archive queues its own. */
	archivedAt: string;
}

export async function reapArchivedCloudWorkspace(
	input: ReapArchivedCloudWorkspaceInput,
): Promise<"reaped" | "skipped"> {
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
	await deleteSandbox(row.providerSandboxId);
	return "reaped";
}

export async function queueReap(
	input: ReapArchivedCloudWorkspaceInput,
): Promise<void> {
	await publishCloudWorkspaceJob({
		path: "/api/cloud-workspaces/reap",
		body: input,
		delaySeconds: ARCHIVE_GRACE_SECONDS,
		runLocally: reapArchivedCloudWorkspace,
	});
}
