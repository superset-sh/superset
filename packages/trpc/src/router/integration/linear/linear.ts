import { db, dbWs } from "@superset/db/client";
import {
	integrationConnections,
	type LinearConfig,
	taskStatuses,
	tasks,
	v2Projects,
} from "@superset/db/schema";
import { seedDefaultStatuses } from "@superset/db/seed-default-statuses";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { Client as QstashClient } from "@upstash/qstash";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../utils";
import { callLinear } from "./refresh";

const qstash = new QstashClient({ token: env.QSTASH_TOKEN });

const MAX_NAMED_PROJECTS_IN_ERROR = 10;

async function loadConnectionForUser(
	connectionId: string,
	userId: string,
	requireAdmin: boolean,
) {
	const connection = await db.query.integrationConnections.findFirst({
		where: eq(integrationConnections.id, connectionId),
	});
	if (!connection || connection.provider !== "linear") {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Linear connection not found",
		});
	}
	if (requireAdmin) {
		await verifyOrgAdmin(userId, connection.organizationId);
	} else {
		await verifyOrgMembership(userId, connection.organizationId);
	}
	return connection;
}

export const linearRouter = {
	listConnections: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const rows = await db
				.select({
					id: integrationConnections.id,
					externalOrgId: integrationConnections.externalOrgId,
					externalOrgName: integrationConnections.externalOrgName,
					config: integrationConnections.config,
					disconnectedAt: integrationConnections.disconnectedAt,
					disconnectReason: integrationConnections.disconnectReason,
					createdAt: integrationConnections.createdAt,
					updatedAt: integrationConnections.updatedAt,
					linkedProjectCount: sql<number>`(
						SELECT COUNT(*)::int FROM ${v2Projects}
						WHERE ${v2Projects.linearConnectionId} = ${integrationConnections.id}
					)`,
				})
				.from(integrationConnections)
				.where(
					and(
						eq(integrationConnections.organizationId, input.organizationId),
						eq(integrationConnections.provider, "linear"),
					),
				)
				.orderBy(integrationConnections.createdAt);
			return rows.map((row) => ({
				...row,
				config: row.config as LinearConfig | null,
			}));
		}),

	getConnection: protectedProcedure
		.input(z.object({ connectionId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			const connection = await loadConnectionForUser(
				input.connectionId,
				ctx.session.user.id,
				false,
			);
			return {
				id: connection.id,
				externalOrgId: connection.externalOrgId,
				externalOrgName: connection.externalOrgName,
				config: connection.config as LinearConfig | null,
				needsReconnect: !!connection.disconnectedAt,
				disconnectReason: connection.disconnectReason,
			};
		}),

	setProjectConnection: protectedProcedure
		.input(
			z.object({
				projectId: z.uuid(),
				connectionId: z.uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const project = await db.query.v2Projects.findFirst({
				where: eq(v2Projects.id, input.projectId),
				columns: { id: true, organizationId: true },
			});
			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			}
			await verifyOrgAdmin(ctx.session.user.id, project.organizationId);

			const connection = await db.query.integrationConnections.findFirst({
				where: eq(integrationConnections.id, input.connectionId),
				columns: { id: true, organizationId: true, provider: true },
			});
			if (
				!connection ||
				connection.provider !== "linear" ||
				connection.organizationId !== project.organizationId
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid Linear connection for this project's organization",
				});
			}

			await db
				.update(v2Projects)
				.set({ linearConnectionId: connection.id })
				.where(eq(v2Projects.id, project.id));

			return { success: true as const };
		}),

	clearProjectConnection: protectedProcedure
		.input(z.object({ projectId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const project = await db.query.v2Projects.findFirst({
				where: eq(v2Projects.id, input.projectId),
				columns: { id: true, organizationId: true },
			});
			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			}
			await verifyOrgAdmin(ctx.session.user.id, project.organizationId);

			await db
				.update(v2Projects)
				.set({ linearConnectionId: null })
				.where(eq(v2Projects.id, project.id));

			return { success: true as const };
		}),

	disconnect: protectedProcedure
		.input(
			z.object({
				connectionId: z.uuid(),
				force: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const connection = await loadConnectionForUser(
				input.connectionId,
				ctx.session.user.id,
				true,
			);

			if (!input.force) {
				const linkedProjects = await db.query.v2Projects.findMany({
					where: eq(v2Projects.linearConnectionId, connection.id),
					columns: { id: true, name: true, slug: true },
					limit: MAX_NAMED_PROJECTS_IN_ERROR + 1,
				});
				if (linkedProjects.length > 0) {
					const totalLinked = await db
						.select({ count: sql<number>`count(*)::int` })
						.from(v2Projects)
						.where(eq(v2Projects.linearConnectionId, connection.id))
						.then((rows) => rows[0]?.count ?? 0);
					return {
						success: false as const,
						requiresConfirmation: true as const,
						linkedProjectCount: totalLinked,
						linkedProjects: linkedProjects
							.slice(0, MAX_NAMED_PROJECTS_IN_ERROR)
							.map((p) => ({ id: p.id, name: p.name, slug: p.slug })),
					};
				}
			}

			try {
				await callLinear({ connectionId: connection.id }, (client) =>
					client.logout(),
				);
			} catch {}

			await dbWs.transaction(async (tx) => {
				const linkedProjectIds = (
					await tx.query.v2Projects.findMany({
						where: eq(v2Projects.linearConnectionId, connection.id),
						columns: { id: true },
					})
				).map((p) => p.id);

				// Count remaining Linear connections in this org. If this is
				// the LAST one, also clean up legacy NULL-connection rows
				// (synced before tasks.linear_connection_id existed). Otherwise
				// scope strictly to this connection's rows.
				const remainingConnections =
					await tx.query.integrationConnections.findMany({
						where: and(
							eq(
								integrationConnections.organizationId,
								connection.organizationId,
							),
							eq(integrationConnections.provider, "linear"),
						),
						columns: { id: true },
					});
				const isLastLinearConnection = remainingConnections.every(
					(c) => c.id === connection.id,
				);

				await tx
					.delete(tasks)
					.where(
						and(
							eq(tasks.organizationId, connection.organizationId),
							eq(tasks.externalProvider, "linear"),
							eq(tasks.linearConnectionId, connection.id),
						),
					);

				if (isLastLinearConnection) {
					// Sweep up unscoped legacy Linear rows (linear_connection_id IS NULL).
					await tx
						.delete(tasks)
						.where(
							and(
								eq(tasks.organizationId, connection.organizationId),
								eq(tasks.externalProvider, "linear"),
								isNull(tasks.linearConnectionId),
							),
						);
				}

				// Only collapse Linear-synced statuses back to defaults when the
				// last Linear connection is going away. Otherwise the remaining
				// connections' tasks are still using these statuses.
				if (isLastLinearConnection) {
					const backlogStatusId = await seedDefaultStatuses(
						connection.organizationId,
						tx,
					);

					const allStatuses = await tx.query.taskStatuses.findMany({
						where: eq(taskStatuses.organizationId, connection.organizationId),
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
										eq(tasks.organizationId, connection.organizationId),
										eq(tasks.statusId, status.id),
									),
								);
						}
					}

					await tx
						.delete(taskStatuses)
						.where(
							and(
								eq(taskStatuses.organizationId, connection.organizationId),
								eq(taskStatuses.externalProvider, "linear"),
							),
						);
				}

				if (linkedProjectIds.length > 0) {
					await tx
						.update(v2Projects)
						.set({ linearConnectionId: null })
						.where(inArray(v2Projects.id, linkedProjectIds));
				}

				await tx
					.delete(integrationConnections)
					.where(eq(integrationConnections.id, connection.id));
			});

			return { success: true as const };
		}),

	getTeams: protectedProcedure
		.input(z.object({ connectionId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await loadConnectionForUser(
				input.connectionId,
				ctx.session.user.id,
				false,
			);
			const teams = await callLinear(
				{ connectionId: input.connectionId },
				(client) => client.teams(),
			);
			if (!teams) return [];
			return teams.nodes.map((t) => ({ id: t.id, name: t.name, key: t.key }));
		}),

	updateConfig: protectedProcedure
		.input(
			z.object({
				connectionId: z.uuid(),
				newTasksTeamId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await loadConnectionForUser(
				input.connectionId,
				ctx.session.user.id,
				true,
			);

			const config: LinearConfig = {
				provider: "linear",
				newTasksTeamId: input.newTasksTeamId,
			};

			await db
				.update(integrationConnections)
				.set({ config })
				.where(eq(integrationConnections.id, input.connectionId));

			return { success: true as const };
		}),

	triggerSync: protectedProcedure
		.input(z.object({ connectionId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const connection = await loadConnectionForUser(
				input.connectionId,
				ctx.session.user.id,
				false,
			);
			if (connection.disconnectedAt) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace is disconnected. Reconnect before syncing.",
				});
			}

			const syncUrl = `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/jobs/initial-sync`;
			const syncBody = {
				organizationId: connection.organizationId,
				connectionId: connection.id,
				creatorUserId: ctx.session.user.id,
			};

			if (env.NODE_ENV === "development") {
				// QStash refuses loopback URLs, so in dev fire the job directly. The
				// handler skips signature verification when NODE_ENV=development.
				// Don't await — let the sync run async like qstash would.
				fetch(syncUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(syncBody),
				}).catch((err) => {
					console.error(
						"[linear/triggerSync] Dev sync invocation failed:",
						err,
					);
				});
			} else {
				await qstash.publishJSON({
					url: syncUrl,
					body: syncBody,
					retries: 3,
				});
			}

			return { success: true as const };
		}),
} satisfies TRPCRouterRecord;
