import type { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

/** Satisfied by both the pooled client and a transaction handle. */
type Executor = Pick<typeof db, "select">;

// Only cloud workspaces can be verified: a local one exists solely in its own
// machine's SQLite, so Neon has nothing to compare against. Known gap — within
// an organization a member can claim a colleague's local workspace key.
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

	// No row means a local workspace, which Neon cannot vouch for.
	if (!cloud) return;

	if (cloud.organizationId !== organizationId) {
		// NOT_FOUND, not FORBIDDEN: another org's workspace ids are not this
		// caller's business.
		throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
	}
}
