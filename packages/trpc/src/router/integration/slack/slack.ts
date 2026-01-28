import { db } from "@superset/db/client";
import { integrationConnections, type SlackConfig } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "./utils";

export const slackRouter = {
	getConnection: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "slack"),
				),
				columns: {
					id: true,
					externalOrgName: true,
					config: true,
					createdAt: true,
				},
			});

			if (!connection) return null;

			return {
				id: connection.id,
				externalOrgName: connection.externalOrgName,
				connectedAt: connection.createdAt,
				config: connection.config as SlackConfig | null,
			};
		}),

	disconnect: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const result = await db
				.delete(integrationConnections)
				.where(
					and(
						eq(integrationConnections.organizationId, input.organizationId),
						eq(integrationConnections.provider, "slack"),
					),
				)
				.returning({ id: integrationConnections.id });

			if (result.length === 0) {
				return { success: false, error: "No connection found" };
			}

			return { success: true };
		}),

	updateConfig: protectedProcedure
		.input(
			z.object({
				organizationId: z.uuid(),
				defaultChannelId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			// Get current config to preserve botUserId
			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "slack"),
				),
				columns: { config: true },
			});

			if (!connection) {
				return { success: false, error: "No connection found" };
			}

			const currentConfig = connection.config as SlackConfig | null;

			const config: SlackConfig = {
				provider: "slack",
				botUserId: currentConfig?.botUserId ?? "",
				defaultChannelId: input.defaultChannelId,
			};

			await db
				.update(integrationConnections)
				.set({ config })
				.where(
					and(
						eq(integrationConnections.organizationId, input.organizationId),
						eq(integrationConnections.provider, "slack"),
					),
				);

			return { success: true };
		}),
} satisfies TRPCRouterRecord;
