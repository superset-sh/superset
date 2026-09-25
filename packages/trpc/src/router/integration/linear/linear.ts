import { db, dbWs } from "@superset/db/client";
import {
	connections,
	type LinearConfig,
	taskStatuses,
	tasks,
} from "@superset/db/schema";
import { seedDefaultStatuses } from "@superset/db/seed-default-statuses";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { userConnection } from "../../../lib/connectors";
import { protectedProcedure } from "../../../trpc";
import { disconnectProcedure } from "../connections";
import { verifyOrgAdmin, verifyOrgMembership } from "../utils";
import { callLinear, callLinearForConnection } from "./refresh";

export const linearRouter = {
	getConnection: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const connection = await userConnection(
				input.organizationId,
				"linear",
				ctx.session.user.id,
				{ includeDisconnected: true },
			);
			if (!connection) return null;
			return {
				config:
					connection.state?.provider === "linear" ? connection.state : null,
				needsReconnect: !!connection.disconnectedAt,
				disconnectReason: connection.disconnectReason,
			};
		}),

	disconnect: disconnectProcedure(
		"linear",
		async (connectionId) => {
			try {
				await callLinearForConnection(connectionId, (client) =>
					client.logout(),
				);
			} catch {}
		},
		async (organizationId) => {
			await dbWs.transaction(async (tx) => {
				// 1. Delete Linear-synced tasks
				await tx
					.delete(tasks)
					.where(
						and(
							eq(tasks.organizationId, organizationId),
							eq(tasks.externalProvider, "linear"),
						),
					);

				// 2. Seed default statuses inside the transaction
				const backlogStatusId = await seedDefaultStatuses(organizationId, tx);

				// 3. Remap remaining local tasks from Linear statuses to default statuses
				const allStatuses = await tx.query.taskStatuses.findMany({
					where: eq(taskStatuses.organizationId, organizationId),
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
									eq(tasks.organizationId, organizationId),
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
							eq(taskStatuses.organizationId, organizationId),
							eq(taskStatuses.externalProvider, "linear"),
						),
					);
			});
		},
	),

	getTeams: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const teams = await callLinear(
				input.organizationId,
				ctx.session.user.id,
				(client) => client.teams(),
			);
			if (!teams) return [];
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
				.update(connections)
				.set({ state: config })
				.where(
					and(
						eq(connections.organizationId, input.organizationId),
						eq(connections.connector, "linear"),
					),
				);

			return { success: true };
		}),
} satisfies TRPCRouterRecord;
