import { db } from "@superset/db/client";
import { taskPriorityValues } from "@superset/db/enums";
import { tasks, users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
	hasLinearConnection,
	queueTaskSync,
} from "../../lib/integrations/linear";
import { protectedProcedure, publicProcedure } from "../../trpc";

export const taskRouter = {
	all: publicProcedure.query(() => {
		return db.query.tasks.findMany({
			with: {
				assignee: {
					columns: {
						id: true,
						name: true,
						avatarUrl: true,
					},
				},
				creator: {
					columns: {
						id: true,
						name: true,
						avatarUrl: true,
					},
				},
			},
			orderBy: desc(tasks.createdAt),
			limit: 50,
		});
	}),

	byRepository: publicProcedure.input(z.string().uuid()).query(({ input }) => {
		return db.query.tasks.findMany({
			where: eq(tasks.repositoryId, input),
			orderBy: desc(tasks.createdAt),
		});
	}),

	byOrganization: publicProcedure
		.input(z.string().uuid())
		.query(({ input }) => {
			return db.query.tasks.findMany({
				where: eq(tasks.organizationId, input),
				orderBy: desc(tasks.createdAt),
			});
		}),

	byId: publicProcedure.input(z.string().uuid()).query(({ input }) => {
		return db.query.tasks.findFirst({
			where: eq(tasks.id, input),
		});
	}),

	bySlug: publicProcedure.input(z.string()).query(({ input }) => {
		return db.query.tasks.findFirst({
			where: eq(tasks.slug, input),
		});
	}),

	create: protectedProcedure
		.input(
			z.object({
				slug: z.string().min(1),
				title: z.string().min(1),
				description: z.string().optional(),
				status: z.string().min(1).default("Backlog"),
				priority: z.enum(taskPriorityValues).default("none"),
				repositoryId: z.string().uuid().optional(),
				organizationId: z.string().uuid(),
				assigneeId: z.string().uuid().optional(),
				branch: z.string().optional(),
				estimate: z.number().int().positive().optional(),
				dueDate: z.coerce.date().optional(),
				labels: z.array(z.string()).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const user = await db.query.users.findFirst({
				where: eq(users.clerkId, ctx.userId),
			});
			if (!user) throw new Error("User not found");

			const [task] = await db
				.insert(tasks)
				.values({
					...input,
					creatorId: user.id,
					labels: input.labels ?? [],
				})
				.returning();

			// Queue sync to Linear if connected (fire-and-forget)
			if (task) {
				const hasLinear = await hasLinearConnection(input.organizationId);
				if (hasLinear) {
					queueTaskSync({ taskId: task.id }).catch((err) => {
						console.error("[task.create] Failed to queue sync:", err);
					});
				}
			}

			return task;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				title: z.string().min(1).optional(),
				description: z.string().nullable().optional(),
				status: z.string().optional(),
				priority: z.enum(taskPriorityValues).optional(),
				assigneeId: z.string().uuid().nullable().optional(),
				branch: z.string().nullable().optional(),
				prUrl: z.string().url().nullable().optional(),
				estimate: z.number().int().positive().nullable().optional(),
				dueDate: z.coerce.date().nullable().optional(),
				labels: z.array(z.string()).optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const { id, ...data } = input;
			const [task] = await db
				.update(tasks)
				.set(data)
				.where(eq(tasks.id, id))
				.returning();

			// Queue sync to Linear if task is linked (fire-and-forget)
			if (task?.externalProvider === "linear") {
				queueTaskSync({ taskId: task.id }).catch((err) => {
					console.error("[task.update] Failed to queue sync:", err);
				});
			}

			return task;
		}),

	updateStatus: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				status: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			const [task] = await db
				.update(tasks)
				.set({ status: input.status })
				.where(eq(tasks.id, input.id))
				.returning();

			// Queue sync to Linear if task is linked (fire-and-forget)
			if (task?.externalProvider === "linear") {
				queueTaskSync({ taskId: task.id }).catch((err) => {
					console.error("[task.updateStatus] Failed to queue sync:", err);
				});
			}

			return task;
		}),

	delete: protectedProcedure
		.input(z.string().uuid())
		.mutation(async ({ input }) => {
			await db.delete(tasks).where(eq(tasks.id, input));
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
