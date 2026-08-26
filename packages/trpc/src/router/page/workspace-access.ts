import type { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

type Executor = Pick<typeof db, "select">;

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

	if (!cloud) return;

	if (cloud.organizationId !== organizationId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
	}
}
