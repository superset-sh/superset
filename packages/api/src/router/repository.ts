import { repositories } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../trpc";

export const repositoryRouter = {
	all: publicProcedure.query(({ ctx }) => {
		return ctx.db.query.repositories.findMany({
			orderBy: desc(repositories.createdAt),
			with: {
				organization: true,
			},
		});
	}),

	byId: publicProcedure.input(z.string().uuid()).query(({ ctx, input }) => {
		return ctx.db.query.repositories.findFirst({
			where: eq(repositories.id, input),
			with: {
				organization: true,
				tasks: true,
			},
		});
	}),

	byOrganization: publicProcedure
		.input(z.string().uuid())
		.query(({ ctx, input }) => {
			return ctx.db.query.repositories.findMany({
				where: eq(repositories.organizationId, input),
				orderBy: desc(repositories.createdAt),
			});
		}),

	byGitHub: publicProcedure
		.input(
			z.object({
				owner: z.string(),
				name: z.string(),
			}),
		)
		.query(({ ctx, input }) => {
			return ctx.db.query.repositories.findFirst({
				where: and(
					eq(repositories.repoOwner, input.owner),
					eq(repositories.repoName, input.name),
				),
				with: {
					organization: true,
				},
			});
		}),

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1),
				slug: z.string().min(1),
				repoUrl: z.string().url(),
				repoOwner: z.string().min(1),
				repoName: z.string().min(1),
				defaultBranch: z.string().default("main"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [repository] = await ctx.db
				.insert(repositories)
				.values(input)
				.returning();
			return repository;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				defaultBranch: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { id, ...data } = input;
			const [repository] = await ctx.db
				.update(repositories)
				.set(data)
				.where(eq(repositories.id, id))
				.returning();
			return repository;
		}),

	delete: protectedProcedure
		.input(z.string().uuid())
		.mutation(async ({ ctx, input }) => {
			await ctx.db.delete(repositories).where(eq(repositories.id, input));
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
