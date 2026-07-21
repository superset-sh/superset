import { getHostId } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";

const nameSchema = z.string().trim().min(1).max(80);
const idSchema = z.string().uuid();

const sidebarCommandSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("list") }),
	z.object({
		action: z.literal("create-group"),
		groupId: idSchema,
		projectId: idSchema,
		name: nameSchema,
	}),
	z.object({
		action: z.literal("rename-group"),
		groupId: idSchema,
		name: nameSchema,
	}),
	z.object({ action: z.literal("delete-group"), groupId: idSchema }),
	z.object({
		action: z.literal("move-workspace"),
		workspaceId: idSchema,
		groupId: idSchema.nullable(),
	}),
	z.object({
		action: z.literal("set-group-collapsed"),
		groupId: idSchema,
		collapsed: z.boolean(),
	}),
]);

export const sidebarRouter = router({
	execute: protectedProcedure
		.input(sidebarCommandSchema)
		.mutation(async ({ ctx, input }) => {
			if (
				input.action === "create-group" &&
				!ctx.db.query.projects
					.findFirst({ where: eq(projects.id, input.projectId) })
					.sync()
			) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Project is not set up on this host: ${input.projectId}`,
				});
			}
			if (
				input.action === "move-workspace" &&
				!ctx.db.query.workspaces
					.findFirst({ where: eq(workspaces.id, input.workspaceId) })
					.sync()
			) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Workspace not found: ${input.workspaceId}`,
				});
			}
			try {
				return await ctx.eventBus.requestSidebarCommand(getHostId(), input);
			} catch (error) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message:
						error instanceof Error ? error.message : "Sidebar command failed",
					cause: error,
				});
			}
		}),
});
