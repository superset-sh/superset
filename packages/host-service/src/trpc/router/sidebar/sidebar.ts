import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SidebarBridgeClient } from "../../../runtime/sidebar-bridge/sidebar-bridge-client";
import { protectedProcedure, router } from "../../index";

/**
 * The desktop sidebar on this machine. Its folders are the signed-in
 * person's own presentation, so only callers on this machine may change
 * them, and only a window of this host's organization applies the change.
 */
export const sidebarRouter = router({
	pruneEmptyFolders: protectedProcedure
		.input(
			z.object({
				projectId: z.string().min(1).optional(),
				dryRun: z.boolean().default(false),
			}),
		)
		.mutation(({ ctx, input }) => {
			if (ctx.isLocalCaller !== true) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						"Sidebar folders can only be changed from the machine that runs the desktop app.",
				});
			}
			if (!ctx.browserBridge) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message:
						"This host has no sidebar to edit (no desktop app is attached to it).",
				});
			}
			return new SidebarBridgeClient(ctx.browserBridge).pruneEmptyFolders({
				organizationId: ctx.organizationId,
				projectId: input.projectId,
				dryRun: input.dryRun,
			});
		}),
});
