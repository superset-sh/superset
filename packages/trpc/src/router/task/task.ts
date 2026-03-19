import { db } from "@superset/db/client";
import { tasks, users } from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { createTasks, deleteTasks, updateTasks } from "../../lib/tasks";
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
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}

			const result = await createTasks({
				organizationId,
				creatorId: ctx.session.user.id,
				inputs: [input],
			});

			return {
				task: result.tasks[0] ?? null,
				txid: result.txid,
			};
		}),

	update: protectedProcedure
		.input(updateTaskSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}

			const result = await updateTasks({
				organizationId,
				inputs: [input],
			});

			return {
				task: result.tasks[0] ?? null,
				txid: result.txid,
			};
		}),

	delete: protectedProcedure
		.input(z.string().uuid())
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}

			const result = await deleteTasks({
				organizationId,
				taskIds: [input],
			});

			return { txid: result.txid };
		}),
} satisfies TRPCRouterRecord;
