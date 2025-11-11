import { taskStatusEnumValues, tasks } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../trpc";

export const taskRouter = {
	all: publicProcedure.query(({ ctx }) => {
		return ctx.db.query.tasks.findMany({
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

	byRepository: publicProcedure
		.input(z.string().uuid())
		.query(({ ctx, input }) => {
			return ctx.db.query.tasks.findMany({
				where: eq(tasks.repositoryId, input),
				orderBy: desc(tasks.createdAt),
			});
		}),

	byOrganization: publicProcedure
		.input(z.string().uuid())
		.query(({ ctx, input }) => {
			return ctx.db.query.tasks.findMany({
				where: eq(tasks.organizationId, input),
				orderBy: desc(tasks.createdAt),
			});
		}),

	byId: publicProcedure.input(z.string().uuid()).query(({ ctx, input }) => {
		return ctx.db.query.tasks.findFirst({
			where: eq(tasks.id, input),
		});
	}),

	bySlug: publicProcedure.input(z.string()).query(({ ctx, input }) => {
		return ctx.db.query.tasks.findFirst({
			where: eq(tasks.slug, input),
		});
	}),

	create: protectedProcedure
		.input(
			z.object({
				slug: z.string().min(1),
				title: z.string().min(1),
				description: z.string().optional(),
				status: z.enum(taskStatusEnumValues).default("planning"),
				repositoryId: z.string().uuid(),
				organizationId: z.string().uuid(),
				assigneeId: z.string().uuid().optional(),
				branch: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [task] = await ctx.db
				.insert(tasks)
				.values({
					...input,
					creatorId: ctx.session.user.id,
				})
				.returning();
			return task;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				title: z.string().min(1).optional(),
				description: z.string().optional(),
				status: z.enum(taskStatusEnumValues).optional(),
				assigneeId: z.string().uuid().nullable().optional(),
				branch: z.string().nullable().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { id, ...data } = input;
			const [task] = await ctx.db
				.update(tasks)
				.set(data)
				.where(eq(tasks.id, id))
				.returning();
			return task;
		}),

	updateStatus: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				status: z.enum(taskStatusEnumValues),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [task] = await ctx.db
				.update(tasks)
				.set({ status: input.status })
				.where(eq(tasks.id, input.id))
				.returning();
			return task;
		}),

	delete: protectedProcedure
		.input(z.string().uuid())
		.mutation(async ({ ctx, input }) => {
			await ctx.db.delete(tasks).where(eq(tasks.id, input));
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
