import type { SelectV2Workspace } from "@superset/db/schema";

/** Identity patch: toward the local row (updateLocal) or cloud (v2Workspace.update). */
export interface WorkspaceIdentityPatch {
	id: string;
	name?: string;
	taskId?: string | null;
}

interface MergeWorkspacePresenceArgs {
	/** This machine's workspaces from the local host-service (authoritative). */
	local: SelectV2Workspace[];
	/** All org workspaces from cloud presence. */
	cloud: SelectV2Workspace[];
	organizationId: string;
	/**
	 * Ids this host-service deleted locally whose cloud presence delete is
	 * still queued (cloud_presence_outbox) — masked so a just-deleted
	 * workspace doesn't resurrect from stale cloud presence.
	 */
	pendingCloudDeleteIds: ReadonlySet<string>;
}

interface MergeWorkspacePresenceResult {
	rows: SelectV2Workspace[];
	/** Cloud identity edits to persist into the local row via updateLocal. */
	patches: WorkspaceIdentityPatch[];
	/** Local identity edits whose cloud mirror is stale, to push via v2Workspace.update. */
	cloudPatches: WorkspaceIdentityPatch[];
}

function identityPatch(
	target: WorkspaceIdentityPatch,
	from: SelectV2Workspace,
	nameDiffers: boolean,
	taskDiffers: boolean,
): WorkspaceIdentityPatch {
	if (nameDiffers) target.name = from.name;
	if (taskDiffers) target.taskId = from.taskId ?? null;
	return target;
}

// Local rows win for existence; cloud contributes presence for everything
// this host-service doesn't own a row for.
// For rows on both sides, identity (name/taskId) reconciles in both
// directions so a rename made anywhere converges everywhere:
// - local row never identity-edited (updatedAt === createdAt): cloud wins
//   outright — pre-flip rows may carry a branch-coalesced placeholder name
//   locally while cloud holds the real one; timestamps can't rank these.
// - otherwise last-write-wins on updatedAt: newer cloud edits are adopted
//   into the local row, newer local edits are pushed to the stale cloud
//   mirror (covers a rename whose cloud write failed at edit time).
// Branch is excluded: the local row must track the actual git branch.
export function mergeWorkspacePresence({
	local,
	cloud,
	organizationId,
	pendingCloudDeleteIds,
}: MergeWorkspacePresenceArgs): MergeWorkspacePresenceResult {
	const localForOrg = local.filter((w) => w.organizationId === organizationId);
	const cloudForOrg = cloud.filter((w) => w.organizationId === organizationId);
	const cloudById = new Map(cloudForOrg.map((w) => [w.id, w]));
	const localIds = new Set(localForOrg.map((w) => w.id));

	const patches: WorkspaceIdentityPatch[] = [];
	const cloudPatches: WorkspaceIdentityPatch[] = [];
	const rows = localForOrg.map((localRow) => {
		const cloudRow = cloudById.get(localRow.id);
		if (!cloudRow) return localRow;
		const nameDiffers = cloudRow.name !== localRow.name;
		const taskDiffers = (cloudRow.taskId ?? null) !== (localRow.taskId ?? null);
		if (!nameDiffers && !taskDiffers) return localRow;

		const localHasRealEdit =
			localRow.updatedAt.getTime() !== localRow.createdAt.getTime();
		const cloudNewer =
			cloudRow.updatedAt.getTime() > localRow.updatedAt.getTime();

		if (!localHasRealEdit || cloudNewer) {
			patches.push(
				identityPatch({ id: localRow.id }, cloudRow, nameDiffers, taskDiffers),
			);
			return {
				...localRow,
				name: cloudRow.name,
				taskId: cloudRow.taskId ?? null,
			};
		}
		cloudPatches.push(
			identityPatch({ id: localRow.id }, localRow, nameDiffers, taskDiffers),
		);
		return localRow;
	});

	// Cloud rows without a local row still render (presence): they may belong
	// to another host, another host-service profile sharing this machine's
	// hostId (dev vs prod), or a machine whose local DB was reset. Only ids
	// this host-service explicitly deleted (pending in the presence outbox)
	// are masked — anything broader hides real workspaces.
	const presence = cloudForOrg.filter(
		(w) => !localIds.has(w.id) && !pendingCloudDeleteIds.has(w.id),
	);
	return { rows: [...rows, ...presence], patches, cloudPatches };
}
