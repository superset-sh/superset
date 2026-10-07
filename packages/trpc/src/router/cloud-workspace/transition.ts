import { db } from "@superset/db/client";
import type { CloudWorkspaceStatus } from "@superset/db/schema";
import { cloudWorkspaces } from "@superset/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Moves a cloud workspace between statuses only from the ones it may leave.
 * The provisioning job and an archive race on the same row: an archive that
 * lands while the box is being made must win, or the job would flip an
 * `archived` row back to `ready` and strand a billed sandbox nothing lists.
 * Returns false when the row was no longer in any of `from`.
 */
export async function transitionCloudWorkspace(args: {
	id: string;
	from: readonly CloudWorkspaceStatus[];
	to: CloudWorkspaceStatus;
	set?: Partial<typeof cloudWorkspaces.$inferInsert>;
}): Promise<boolean> {
	const moved = await db
		.update(cloudWorkspaces)
		.set({ ...args.set, status: args.to })
		.where(
			and(
				eq(cloudWorkspaces.id, args.id),
				inArray(cloudWorkspaces.status, [...args.from]),
			),
		)
		.returning({ id: cloudWorkspaces.id });
	return moved.length > 0;
}
