import { db, dbWs } from "@superset/db/client";
import { members, taskStatuses, tasks, users } from "@superset/db/schema";
import { seedDefaultStatuses } from "@superset/db/seed-default-statuses";
import { getCurrentTxid } from "@superset/db/utils";
import {
	generateBaseTaskSlug,
	generateUniqueTaskSlug,
} from "@superset/shared/task-slug";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, ilike, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { syncTask } from "../../lib/integrations/sync";
import { protectedProcedure, publicProcedure } from "../../trpc";
import {
	createTaskFromUiSchema,
	createTaskSchema,
	updateTaskSchema,
} from "./schema";

const TASK_SLUG_CONSTRAINT = "tasks_org_slug_unique";
const TASK_SLUG_RETRY_LIMIT = 5;

function isConstraintError(error: unknown, constraint: string): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const maybeError = error as { code?: string; constraint?: string };
	return maybeError.code === "23505" && maybeError.constraint === constraint;
}

export const taskRouter = {
	all: publicProcedure.query(() => {
		const assignee = alias(users, "assignee");
		const creator = alias(users, "creator");

		return db
			.select({
				task: tasks,
				assignee: {
					id: assignee.id,
					name: assignee.name,
					image: assignee.image,
				},
				creator: {
					id: creator.id,
					name: creator.name,
					image: creator.image,
				},
			})
			.from(tasks)
			.leftJoin(assignee, eq(tasks.assigneeId, assignee.id))
			.leftJoin(creator, eq(tasks.creatorId, creator.id))
			.where(isNull(tasks.deletedAt))
			.orderBy(desc(tasks.createdAt));
	}),

	byOrganization: publicProcedure
		.input(z.string().uuid())
		.query(({ input }) => {
			return db
				.select()
				.from(tasks)
				.where(and(eq(tasks.organizationId, input), isNull(tasks.deletedAt)))
				.orderBy(desc(tasks.createdAt));
		}),

	byId: publicProcedure.input(z.string().uuid()).query(async ({ input }) => {
		const [task] = await db
			.select()
			.from(tasks)
			.where(and(eq(tasks.id, input), isNull(tasks.deletedAt)))
			.limit(1);
		return task ?? null;
	}),

	bySlug: publicProcedure.input(z.string()).query(async ({ input }) => {
		const [task] = await db
			.select()
			.from(tasks)
			.where(and(eq(tasks.slug, input), isNull(tasks.deletedAt)))
			.limit(1);
		return task ?? null;
	}),

	create: protectedProcedure
		.input(createTaskSchema)
		.mutation(async ({ ctx, input }) => {
			const result = await dbWs.transaction(async (tx) => {
				const [task] = await tx
					.insert(tasks)
					.values({
						...input,
						creatorId: ctx.session.user.id,
						labels: input.labels ?? [],
					})
					.returning();

				const txid = await getCurrentTxid(tx);

				return { task, txid };
			});

			if (result.task) {
				syncTask(result.task.id);
			}

			return result;
		}),

	createFromUi: protectedProcedure
		.input(createTaskFromUiSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No active organization selected",
				});
			}

			for (let attempt = 0; attempt < TASK_SLUG_RETRY_LIMIT; attempt += 1) {
				try {
					const result = await dbWs.transaction(async (tx) => {
						const statusId = input.statusId
							? (
									await tx
										.select({ id: taskStatuses.id })
										.from(taskStatuses)
										.where(
											and(
												eq(taskStatuses.id, input.statusId),
												eq(taskStatuses.organizationId, organizationId),
											),
										)
										.limit(1)
								)[0]?.id
							: await seedDefaultStatuses(organizationId, tx);

						if (!statusId) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message: "Status must belong to the active organization",
							});
						}

						const assigneeId = input.assigneeId
							? ((
									await tx
										.select({ userId: members.userId })
										.from(members)
										.where(
											and(
												eq(members.organizationId, organizationId),
												eq(members.userId, input.assigneeId),
											),
										)
										.limit(1)
								)[0]?.userId ?? null)
							: null;

						if (input.assigneeId && !assigneeId) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message: "Assignee must belong to the active organization",
							});
						}

						const baseSlug = generateBaseTaskSlug(input.title);
						const existingSlugs = await tx
							.select({ slug: tasks.slug })
							.from(tasks)
							.where(
								and(
									eq(tasks.organizationId, organizationId),
									ilike(tasks.slug, `${baseSlug}%`),
								),
							);
						const slug = generateUniqueTaskSlug(
							baseSlug,
							existingSlugs.map((task) => task.slug),
						);

						const [task] = await tx
							.insert(tasks)
							.values({
								slug,
								title: input.title,
								description: input.description ?? null,
								statusId,
								priority: input.priority ?? "none",
								organizationId,
								creatorId: ctx.session.user.id,
								assigneeId,
								estimate: input.estimate ?? null,
								dueDate: input.dueDate ?? null,
								labels: input.labels ?? [],
							})
							.returning();

						const txid = await getCurrentTxid(tx);

						return { task, txid };
					});

					if (result.task) {
						syncTask(result.task.id);
					}

					return result;
				} catch (error) {
					if (
						isConstraintError(error, TASK_SLUG_CONSTRAINT) &&
						attempt < TASK_SLUG_RETRY_LIMIT - 1
					) {
						continue;
					}

					throw error;
				}
			}

			throw new TRPCError({
				code: "CONFLICT",
				message: "Failed to generate a unique task slug",
			});
		}),

	update: protectedProcedure
		.input(updateTaskSchema)
		.mutation(async ({ input }) => {
			const { id, ...data } = input;

			// Enforce assignee invariant: setting internal assignee clears external snapshot
			const updateData: Record<string, unknown> = { ...data };
			if ("assigneeId" in data) {
				updateData.assigneeExternalId = null;
				updateData.assigneeDisplayName = null;
				updateData.assigneeAvatarUrl = null;
			}

			const result = await dbWs.transaction(async (tx) => {
				const [task] = await tx
					.update(tasks)
					.set(updateData)
					.where(eq(tasks.id, id))
					.returning();

				const txid = await getCurrentTxid(tx);

				return { task, txid };
			});

			if (result.task) {
				syncTask(result.task.id);
			}

			return result;
		}),

	delete: protectedProcedure
		.input(z.string().uuid())
		.mutation(async ({ input }) => {
			const result = await dbWs.transaction(async (tx) => {
				const [deleted] = await tx
					.update(tasks)
					.set({ deletedAt: new Date() })
					.where(eq(tasks.id, input))
					.returning({
						externalProvider: tasks.externalProvider,
						externalId: tasks.externalId,
					});

				const txid = await getCurrentTxid(tx);

				return { txid, deleted };
			});

			if (result.deleted?.externalProvider && result.deleted?.externalId) {
				syncTask(input);
			}

			return { txid: result.txid };
		}),
} satisfies TRPCRouterRecord;
