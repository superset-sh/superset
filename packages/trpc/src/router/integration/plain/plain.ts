import { db, dbWs } from "@superset/db/client";
import {
	integrationConnections,
	type PlainConfig,
	taskStatuses,
	tasks,
} from "@superset/db/schema";
import { seedDefaultStatuses } from "@superset/db/seed-default-statuses";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { Client } from "@upstash/qstash";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../utils";
import { PlainApiError, PlainClient } from "./client";
import { MY_WORKSPACE_QUERY, type MyWorkspaceResponse } from "./threads";

const qstash = new Client({ token: env.QSTASH_TOKEN });

async function fetchWorkspaceForApiKey(apiKey: string) {
	try {
		const response = await new PlainClient(apiKey).request<
			MyWorkspaceResponse,
			Record<string, never>
		>(MY_WORKSPACE_QUERY, {});
		if (response.myWorkspace) return response.myWorkspace;
	} catch (error) {
		if (!(error instanceof PlainApiError)) throw error;
	}
	throw new TRPCError({
		code: "BAD_REQUEST",
		message:
			"Plain rejected the API key. Create a machine user API key with the thread:read, customer:read, and labelType:read permissions and try again.",
	});
}

export const plainRouter = {
	getConnection: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "plain"),
				),
				columns: {
					id: true,
					externalOrgName: true,
					webhookSecret: true,
					disconnectedAt: true,
					disconnectReason: true,
				},
			});
			if (!connection) return null;
			return {
				externalOrgName: connection.externalOrgName,
				hasWebhookSecret: !!connection.webhookSecret,
				needsReconnect: !!connection.disconnectedAt,
				disconnectReason: connection.disconnectReason,
			};
		}),

	connect: protectedProcedure
		.input(
			z.object({
				organizationId: z.uuid(),
				apiKey: z.string().min(1),
				webhookSecret: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const workspace = await fetchWorkspaceForApiKey(input.apiKey);

			const config: PlainConfig = { provider: "plain" };
			const webhookSecret = input.webhookSecret?.trim() || null;

			await db
				.insert(integrationConnections)
				.values({
					organizationId: input.organizationId,
					connectedByUserId: ctx.session.user.id,
					provider: "plain",
					accessToken: input.apiKey,
					webhookSecret,
					externalOrgId: workspace.id,
					externalOrgName: workspace.name,
					config,
				})
				.onConflictDoUpdate({
					target: [
						integrationConnections.organizationId,
						integrationConnections.provider,
					],
					set: {
						connectedByUserId: ctx.session.user.id,
						accessToken: input.apiKey,
						webhookSecret,
						externalOrgId: workspace.id,
						externalOrgName: workspace.name,
						config,
						disconnectedAt: null,
						disconnectReason: null,
					},
				});

			let syncQueued = true;
			try {
				await qstash.publishJSON({
					url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/plain/jobs/initial-sync`,
					body: {
						organizationId: input.organizationId,
						creatorUserId: ctx.session.user.id,
					},
					retries: 3,
				});
			} catch (error) {
				console.error("[plain/connect] Failed to queue initial sync:", error);
				syncQueued = false;
			}

			return { success: true, syncQueued, workspaceName: workspace.name };
		}),

	disconnect: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const result = await dbWs.transaction(async (tx) => {
				// 1. Delete Plain-synced tasks
				await tx
					.delete(tasks)
					.where(
						and(
							eq(tasks.organizationId, input.organizationId),
							eq(tasks.externalProvider, "plain"),
						),
					);

				// 2. Remap any remaining tasks off Plain statuses. Unlike the Linear
				// disconnect this only seeds defaults when the org has no other
				// statuses left — another provider's statuses stay authoritative.
				const allStatuses = await tx.query.taskStatuses.findMany({
					where: eq(taskStatuses.organizationId, input.organizationId),
				});

				const plainStatuses = allStatuses.filter(
					(status) => status.externalProvider === "plain",
				);
				const otherStatuses = allStatuses.filter(
					(status) => status.externalProvider !== "plain",
				);

				let fallbackStatusId: string | null = null;
				const otherStatusByType = new Map<string, string>();
				if (otherStatuses.length === 0) {
					fallbackStatusId = await seedDefaultStatuses(
						input.organizationId,
						tx,
					);
					const seeded = await tx.query.taskStatuses.findMany({
						where: and(
							eq(taskStatuses.organizationId, input.organizationId),
							isNull(taskStatuses.externalProvider),
						),
					});
					otherStatuses.push(...seeded);
				}
				for (const status of otherStatuses) {
					if (!otherStatusByType.has(status.type)) {
						otherStatusByType.set(status.type, status.id);
					}
					fallbackStatusId ??= status.id;
				}

				for (const status of plainStatuses) {
					const targetStatusId =
						otherStatusByType.get(status.type) ?? fallbackStatusId;
					if (!targetStatusId) continue;
					await tx
						.update(tasks)
						.set({ statusId: targetStatusId })
						.where(
							and(
								eq(tasks.organizationId, input.organizationId),
								eq(tasks.statusId, status.id),
							),
						);
				}

				// 3. Delete Plain task statuses
				await tx
					.delete(taskStatuses)
					.where(
						and(
							eq(taskStatuses.organizationId, input.organizationId),
							eq(taskStatuses.externalProvider, "plain"),
						),
					);

				// 4. Delete the integration connection
				return tx
					.delete(integrationConnections)
					.where(
						and(
							eq(integrationConnections.organizationId, input.organizationId),
							eq(integrationConnections.provider, "plain"),
						),
					)
					.returning({ id: integrationConnections.id });
			});

			if (result.length === 0) {
				return { success: false, error: "No connection found" };
			}

			return { success: true };
		}),

	updateWebhookSecret: protectedProcedure
		.input(
			z.object({
				organizationId: z.uuid(),
				webhookSecret: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			await db
				.update(integrationConnections)
				.set({ webhookSecret: input.webhookSecret.trim() || null })
				.where(
					and(
						eq(integrationConnections.organizationId, input.organizationId),
						eq(integrationConnections.provider, "plain"),
					),
				);

			return { success: true };
		}),
} satisfies TRPCRouterRecord;
