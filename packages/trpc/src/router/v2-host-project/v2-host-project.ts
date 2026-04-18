import { dbWs } from "@superset/db/client";
import { v2HostProjects, v2Hosts, v2Projects } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { jwtProcedure } from "../../trpc";
import { requireHostAccess } from "../utils/host-access";
import { requireOrgScopedResource } from "../utils/org-resource-access";

async function resolveProjectHostOrg(
	projectId: string,
	hostId: string,
	organizationIds: string[],
) {
	const project = await requireOrgScopedResource(
		() =>
			dbWs.query.v2Projects.findFirst({
				columns: { id: true, organizationId: true },
				where: eq(v2Projects.id, projectId),
			}),
		{ message: "Project not found" },
	);
	if (!organizationIds.includes(project.organizationId)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
		});
	}
	await requireOrgScopedResource(
		() =>
			dbWs.query.v2Hosts.findFirst({
				columns: { id: true, organizationId: true },
				where: eq(v2Hosts.id, hostId),
			}),
		{
			code: "BAD_REQUEST",
			message: "Host not found in this organization",
			organizationId: project.organizationId,
		},
	);
	return { organizationId: project.organizationId };
}

export const v2HostProjectRouter = {
	upsert: jwtProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				hostId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await requireHostAccess(ctx.userId, input.hostId);
			const { organizationId } = await resolveProjectHostOrg(
				input.projectId,
				input.hostId,
				ctx.organizationIds,
			);

			const [row] = await dbWs
				.insert(v2HostProjects)
				.values({
					organizationId,
					projectId: input.projectId,
					hostId: input.hostId,
				})
				.onConflictDoUpdate({
					target: [v2HostProjects.projectId, v2HostProjects.hostId],
					set: { updatedAt: new Date() },
				})
				.returning();
			if (!row) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to upsert host-project binding",
				});
			}
			return row;
		}),

	delete: jwtProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				hostId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await requireHostAccess(ctx.userId, input.hostId);
			await resolveProjectHostOrg(
				input.projectId,
				input.hostId,
				ctx.organizationIds,
			);

			await dbWs
				.delete(v2HostProjects)
				.where(
					and(
						eq(v2HostProjects.projectId, input.projectId),
						eq(v2HostProjects.hostId, input.hostId),
					),
				);
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
