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
	localMachineId: string | null;
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

// Local rows win for existence; cloud contributes other hosts' presence.
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
	localMachineId,
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

	// hostId === localMachineId but no local row means stale cloud presence
	// (e.g. deleted locally while the cloud delete failed) — don't resurrect.
	const remote = cloudForOrg.filter(
		(w) => w.hostId !== localMachineId && !localIds.has(w.id),
	);
	return { rows: [...rows, ...remote], patches, cloudPatches };
}
