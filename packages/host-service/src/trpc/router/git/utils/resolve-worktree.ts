import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { workspaces } from "../../../../db/schema";
import type { protectedProcedure } from "../../../index";

/** Only `db` is read, so this also accepts the plain context an offLoop()
 * `prepare` stage receives (where request-only fields are optional). */
export function resolveWorktreePath(
	ctx: Pick<
		Parameters<Parameters<typeof protectedProcedure.query>[0]>[0]["ctx"],
		"db"
	>,
	workspaceId: string,
): string {
	const workspace = ctx.db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();
	if (!workspace?.worktreePath) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workspace not found",
		});
	}
	return workspace.worktreePath;
}
