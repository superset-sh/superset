import { owesFullPass } from "./attention";
import type { V1MigrationIpc } from "./ipc";

export type V2SurfacePass = "full" | "groups-only";

/**
 * Which pass a boot on the v2 surface owes. A machine can land on v2 without
 * ever having run the v1-surface migration (account created after the v2-only
 * cutoff on an install that already held v1 data, explicit opt-in, forced
 * flip), so unmigrated v1 rows must trigger the full pass here too.
 */
export function planV2SurfacePass({
	followUpPending,
	migrationComplete,
	hasV1Data,
	hasAttentionItems = false,
}: {
	followUpPending: boolean;
	migrationComplete: boolean;
	hasV1Data: boolean;
	hasAttentionItems?: boolean;
}): V2SurfacePass {
	if (followUpPending || hasAttentionItems) return "full";
	if (!migrationComplete && hasV1Data) return "full";
	return "groups-only";
}

// An org whose v1 items all belong to another org still runs one quiet full
// pass: older builds read its completion marker to pick the v2 surface.
export async function planV1AutoPass({
	ipc,
	leftOut = 0,
	organizationId,
	followUpPending,
	migrationComplete,
}: {
	leftOut?: number;
	ipc: Pick<
		V1MigrationIpc,
		| "ledgerList"
		| "readV1Projects"
		| "readV1Workspaces"
		| "readV1Worktrees"
		| "resolvePaths"
	>;
	organizationId: string;
	followUpPending: boolean;
	migrationComplete: boolean;
}): Promise<{ pass: V2SurfacePass; showsProgress: boolean }> {
	const [ledgerRows, v1Projects, v1Workspaces, v1Worktrees] = await Promise.all(
		[
			ipc.ledgerList(organizationId),
			ipc.readV1Projects(),
			ipc.readV1Workspaces(),
			ipc.readV1Worktrees(),
		],
	);
	const hasAttentionItems = await owesFullPass({
		ledgerRows,
		v1Projects,
		v1Workspaces,
		v1Worktrees,
		resolvePaths: (paths) => ipc.resolvePaths(paths),
	});
	const hasV1Data = v1Projects.length + v1Workspaces.length > 0;
	return {
		pass: planV2SurfacePass({
			followUpPending,
			migrationComplete,
			hasV1Data: hasV1Data || leftOut > 0,
			hasAttentionItems,
		}),
		showsProgress: !migrationComplete && hasV1Data,
	};
}
