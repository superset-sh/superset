import { organizationMembers, organizations } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../trpc";

export const organizationRouter = {
	all: publicProcedure.query(({ ctx }) => {
		return ctx.db.query.organizations.findMany({
			orderBy: desc(organizations.createdAt),
			with: {
				members: {
					with: {
						user: true,
					},
				},
			},
		});
	}),

	byId: publicProcedure.input(z.string().uuid()).query(({ ctx, input }) => {
		return ctx.db.query.organizations.findFirst({
			where: eq(organizations.id, input),
			with: {
				members: {
					with: {
						user: true,
					},
				},
				repositories: true,
			},
		});
	}),

	bySlug: publicProcedure.input(z.string()).query(({ ctx, input }) => {
		return ctx.db.query.organizations.findFirst({
			where: eq(organizations.slug, input),
			with: {
				members: {
					with: {
						user: true,
					},
				},
				repositories: true,
			},
		});
	}),

	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				slug: z.string().min(1),
				githubOrg: z.string().optional(),
				avatarUrl: z.string().url().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Create organization
			const [organization] = await ctx.db
				.insert(organizations)
				.values(input)
				.returning();

			// Add creator as a member
			if (ctx.session?.user.id && organization) {
				await ctx.db.insert(organizationMembers).values({
					organizationId: organization.id,
					userId: ctx.session.user.id,
				});
			}

			return organization;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				githubOrg: z.string().optional(),
				avatarUrl: z.string().url().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { id, ...data } = input;
			const [organization] = await ctx.db
				.update(organizations)
				.set(data)
				.where(eq(organizations.id, id))
				.returning();
			return organization;
		}),

	delete: protectedProcedure
		.input(z.string().uuid())
		.mutation(async ({ ctx, input }) => {
			await ctx.db.delete(organizations).where(eq(organizations.id, input));
			return { success: true };
		}),

	addMember: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				userId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [member] = await ctx.db
				.insert(organizationMembers)
				.values(input)
				.returning();
			return member;
		}),

	removeMember: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				userId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await ctx.db
				.delete(organizationMembers)
				.where(
					and(
						eq(organizationMembers.organizationId, input.organizationId),
						eq(organizationMembers.userId, input.userId),
					),
				);
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
