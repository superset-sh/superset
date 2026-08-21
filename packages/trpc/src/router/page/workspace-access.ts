import type { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

/** Satisfied by both the pooled client and a transaction handle. */
type Executor = Pick<typeof db, "select">;

/**
 * May this caller use `workspaceId` as a republish key?
 *
 * What this can check depends on which kind of workspace it is, and the
 * difference is worth stating plainly rather than papering over:
 *
 * - **Cloud**: the row lives in Neon, so its organization is compared
 *   directly. This is a real boundary and closes cross-tenant use outright.
 * - **Local**: the workspace exists only in one machine's SQLite. Neon holds
 *   nothing to compare against, so there is no server-side check to make.
 *
 * The CLI only sends a `workspaceId` when the file resolves inside
 * `$SUPERSET_WORKSPACE_PATH`, and host-service sets that variable alongside
 * `$SUPERSET_WORKSPACE_ID` — so in practice a caller claims a workspace only
 * while standing in it. That is ergonomics, not enforcement: the API takes
 * whatever id it is given.
 *
 * The gap this leaves: within one organization, a member could claim
 * `(workspaceId, entry_path)` for a colleague's *local* workspace, so the
 * colleague's next republish adds a version to the squatter's page. Closing it
 * needs local workspaces to have a verifiable identity in Neon, which is a
 * larger change than this feature should make.
 */
export async function assertWorkspaceAccess({
	executor,
	workspaceId,
	organizationId,
}: {
	executor: Executor;
	workspaceId: string;
	organizationId: string;
}): Promise<void> {
	const [cloud] = await executor
		.select({ organizationId: cloudWorkspaces.organizationId })
		.from(cloudWorkspaces)
		.where(eq(cloudWorkspaces.id, workspaceId))
		.limit(1);

	// No row means a local workspace, which Neon cannot vouch for either way.
	if (!cloud) return;

	if (cloud.organizationId !== organizationId) {
		// NOT_FOUND rather than FORBIDDEN: whether a workspace id exists in
		// another organization is not this caller's business.
		throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
	}
}
