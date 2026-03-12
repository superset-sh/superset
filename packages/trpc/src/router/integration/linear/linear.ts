import { db, dbWs } from "@superset/db/client";
import {
	integrationConnections,
	type LinearConfig,
	taskStatuses,
	tasks,
} from "@superset/db/schema";
import { seedDefaultStatuses } from "@superset/db/seed-default-statuses";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../utils";
import { getLinearClient } from "./utils";

export const linearRouter = {
	getConnection: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "linear"),
				),
				columns: { id: true, config: true },
			});
			if (!connection) return null;
			return { config: connection.config as LinearConfig | null };
		}),

	disconnect: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const result = await dbWs.transaction(async (tx) => {
				// 1. Delete Linear-synced tasks
				await tx
					.delete(tasks)
					.where(
						and(
							eq(tasks.organizationId, input.organizationId),
							eq(tasks.externalProvider, "linear"),
						),
					);

				// 2. Seed default statuses inside the transaction
				const backlogStatusId = await seedDefaultStatuses(
					input.organizationId,
					tx,
				);

				// 3. Remap remaining local tasks from Linear statuses to default statuses
				const allStatuses = await tx.query.taskStatuses.findMany({
					where: eq(taskStatuses.organizationId, input.organizationId),
				});

				const defaultStatusByType = new Map<string, string>();
				for (const status of allStatuses) {
					if (!status.externalProvider && status.type) {
						if (!defaultStatusByType.has(status.type)) {
							defaultStatusByType.set(status.type, status.id);
						}
					}
				}

				for (const status of allStatuses) {
					if (status.externalProvider === "linear") {
						const defaultStatusId =
							(status.type && defaultStatusByType.get(status.type)) ||
							backlogStatusId;
						await tx
							.update(tasks)
							.set({ statusId: defaultStatusId })
							.where(
								and(
									eq(tasks.organizationId, input.organizationId),
									eq(tasks.statusId, status.id),
								),
							);
					}
				}

				// 4. Delete Linear task statuses
				await tx
					.delete(taskStatuses)
					.where(
						and(
							eq(taskStatuses.organizationId, input.organizationId),
							eq(taskStatuses.externalProvider, "linear"),
						),
					);

				// 5. Delete the integration connection
				return tx
					.delete(integrationConnections)
					.where(
						and(
							eq(integrationConnections.organizationId, input.organizationId),
							eq(integrationConnections.provider, "linear"),
						),
					)
					.returning({ id: integrationConnections.id });
			});

			if (result.length === 0) {
				return { success: false, error: "No connection found" };
			}

			return { success: true };
		}),

	getTeams: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const client = await getLinearClient(input.organizationId);
			if (!client) return [];
			const teams = await client.teams();
			return teams.nodes.map((t) => ({ id: t.id, name: t.name, key: t.key }));
		}),

	updateConfig: protectedProcedure
		.input(
			z.object({
				organizationId: z.uuid(),
				newTasksTeamId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const config: LinearConfig = {
				provider: "linear",
				newTasksTeamId: input.newTasksTeamId,
			};

			await db
				.update(integrationConnections)
				.set({ config })
				.where(
					and(
						eq(integrationConnections.organizationId, input.organizationId),
						eq(integrationConnections.provider, "linear"),
					),
				);

			return { success: true };
		}),
} satisfies TRPCRouterRecord;
