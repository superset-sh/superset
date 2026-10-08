import { db } from "@superset/db/client";
import { connections, type LinearConfig } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { userConnection } from "../../../lib/connectors";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../utils";
import { linearLiveRouter } from "./live";
import { callLinear, callLinearForConnection } from "./refresh";
import { trackTasksInSupersetWithoutLinear } from "./tracker";

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
			await trackTasksInSupersetWithoutLinear(input.organizationId);
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
