import { db } from "@superset/db/client";
import { organizationMembers, organizations, users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../trpc";

export const organizationRouter = {
	all: publicProcedure.query(() => {
		return db.query.organizations.findMany({
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

	byId: publicProcedure.input(z.string().uuid()).query(({ input }) => {
		return db.query.organizations.findFirst({
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

	bySlug: publicProcedure.input(z.string()).query(({ input }) => {
		return db.query.organizations.findFirst({
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
			const user = await db.query.users.findFirst({
				where: eq(users.clerkId, ctx.session.userId),
			});

			const [organization] = await db
				.insert(organizations)
				.values(input)
				.returning();

			if (user && organization) {
				await db.insert(organizationMembers).values({
					organizationId: organization.id,
					userId: user.id,
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
		.mutation(async ({ input }) => {
			const { id, ...data } = input;
			const [organization] = await db
				.update(organizations)
				.set(data)
				.where(eq(organizations.id, id))
				.returning();
			return organization;
		}),

	delete: protectedProcedure
		.input(z.string().uuid())
		.mutation(async ({ input }) => {
			await db.delete(organizations).where(eq(organizations.id, input));
			return { success: true };
		}),

	addMember: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				userId: z.string().uuid(),
			}),
		)
		.mutation(async ({ input }) => {
			const [member] = await db
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
		.mutation(async ({ input }) => {
			await db
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
