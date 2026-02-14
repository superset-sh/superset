import { db, dbWs } from "@superset/db/client";
import { tasks, users } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { syncTask } from "../../lib/integrations/sync";
import { protectedProcedure, publicProcedure } from "../../trpc";
import { createTaskSchema, updateTaskSchema } from "./schema";

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

	update: protectedProcedure
		.input(updateTaskSchema)
		.mutation(async ({ input }) => {
			const { id, ...data } = input;

			const result = await dbWs.transaction(async (tx) => {
				const [task] = await tx
					.update(tasks)
					.set(data)
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
				await tx
					.update(tasks)
					.set({ deletedAt: new Date() })
					.where(eq(tasks.id, input));

				const txid = await getCurrentTxid(tx);

				return { txid };
			});

			return result;
		}),
} satisfies TRPCRouterRecord;
