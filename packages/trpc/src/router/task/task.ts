import { db, dbWs } from "@superset/db/client";
import { tasks, users } from "@superset/db/schema";
import { seedDefaultStatuses } from "@superset/db/seed-default-statuses";
import { getCurrentTxid } from "@superset/db/utils";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { syncTask } from "../../lib/integrations/sync";
import { protectedProcedure, publicProcedure } from "../../trpc";
import {
	createTaskFromUiSchema,
	createTaskSchema,
	updateTaskSchema,
} from "./schema";

function generateBaseSlug(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 50);

	return slug || "task";
}

async function generateUniqueTaskSlug(
	organizationId: string,
	title: string,
): Promise<string> {
	const baseSlug = generateBaseSlug(title);

	const existingTasks = await db
		.select({ slug: tasks.slug })
		.from(tasks)
		.where(
			and(
				eq(tasks.organizationId, organizationId),
				isNull(tasks.deletedAt),
				or(ilike(tasks.slug, `${baseSlug}%`)),
			),
		);

	const usedSlugs = new Set(existingTasks.map((task) => task.slug));

	if (!usedSlugs.has(baseSlug)) {
		return baseSlug;
	}

	let counter = 1;
	let slug = `${baseSlug}-${counter}`;
	while (usedSlugs.has(slug)) {
		counter += 1;
		slug = `${baseSlug}-${counter}`;
	}

	return slug;
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

			const slug = await generateUniqueTaskSlug(organizationId, input.title);

			const result = await dbWs.transaction(async (tx) => {
				const statusId =
					input.statusId ?? (await seedDefaultStatuses(organizationId, tx));

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
						assigneeId: input.assigneeId ?? null,
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
