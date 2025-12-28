import { db } from "@superset/db/client";
import { tasks, users } from "@superset/db/schema";
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
					avatarUrl: assignee.avatarUrl,
				},
				creator: {
					id: creator.id,
					name: creator.name,
					avatarUrl: creator.avatarUrl,
				},
			})
			.from(tasks)
			.leftJoin(assignee, eq(tasks.assigneeId, assignee.id))
			.leftJoin(creator, eq(tasks.creatorId, creator.id))
			.where(isNull(tasks.deletedAt))
			.orderBy(desc(tasks.createdAt));
	}),

	byRepository: publicProcedure.input(z.string().uuid()).query(({ input }) => {
		return db
			.select()
			.from(tasks)
			.where(and(eq(tasks.repositoryId, input), isNull(tasks.deletedAt)))
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
			const [user] = await db
				.select()
				.from(users)
				.where(eq(users.clerkId, ctx.userId))
				.limit(1);
			if (!user) throw new Error("User not found");

			const [task] = await db
				.insert(tasks)
				.values({
					...input,
					creatorId: user.id,
					labels: input.labels ?? [],
				})
				.returning();

			if (task) {
				syncTask(task.id);
			}

			return task;
		}),

	update: protectedProcedure
		.input(updateTaskSchema)
		.mutation(async ({ input }) => {
			const { id, ...data } = input;
			const [task] = await db
				.update(tasks)
				.set(data)
				.where(eq(tasks.id, id))
				.returning();

			if (task) {
				syncTask(task.id);
			}

			return task;
		}),

	delete: protectedProcedure
		.input(z.string().uuid())
		.mutation(async ({ input }) => {
			await db
				.update(tasks)
				.set({ deletedAt: new Date() })
				.where(eq(tasks.id, input));
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
