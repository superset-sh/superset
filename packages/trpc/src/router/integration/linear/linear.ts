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
import { verifyOrgAdmin, verifyOrgMembership } from "../utils";
import { linearLiveRouter } from "./live";
import { callLinear, callLinearForConnection } from "./refresh";

export const linearRouter = {
	...linearLiveRouter,

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
				externalOrgName: connection.externalAccountLabel,
			};
		}),

	disconnect: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const connection = await userConnection(
				input.organizationId,
				"linear",
				ctx.session.user.id,
				{ includeDisconnected: true },
			);
			if (!connection) {
				return { success: false, error: "No connection found" };
			}

			try {
				await callLinearForConnection(connection.id, (client) =>
					client.logout(),
				);
			} catch {}
			await db.delete(connections).where(eq(connections.id, connection.id));

			const [remaining] = await db
				.select({ id: connections.id })
				.from(connections)
				.where(
					and(
						eq(connections.organizationId, input.organizationId),
						eq(connections.connector, "linear"),
					),
				)
				.limit(1);
			if (!remaining) {
				await removeSyncedTasks(input.organizationId);
			}

			return { success: true };
		}),

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

async function removeSyncedTasks(organizationId: string) {
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
}
