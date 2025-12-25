import { db } from "@superset/db/client";
import {
	integrationConnections,
	organizationMembers,
	users,
} from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { linearRouter } from "./linear";

export const integrationRouter = {
	/**
	 * Linear-specific endpoints
	 */
	linear: linearRouter,

	/**
	 * List all integration connections for an organization
	 */
	list: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			// Verify user is a member of the organization
			const user = await db.query.users.findFirst({
				where: eq(users.clerkId, ctx.userId),
			});

			if (!user) {
				throw new Error("User not found");
			}

			const membership = await db.query.organizationMembers.findFirst({
				where: and(
					eq(organizationMembers.organizationId, input.organizationId),
					eq(organizationMembers.userId, user.id),
				),
			});

			if (!membership) {
				throw new Error("Not a member of this organization");
			}

			const connections = await db.query.integrationConnections.findMany({
				where: eq(integrationConnections.organizationId, input.organizationId),
				columns: {
					id: true,
					provider: true,
					externalOrgId: true,
					externalOrgName: true,
					syncEnabled: true,
					config: true,
					createdAt: true,
					updatedAt: true,
				},
			});

			return connections;
		}),

	/**
	 * Toggle sync for an integration
	 */
	toggleSync: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				provider: z.enum(["linear", "github"]),
				enabled: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Verify user is an admin of the organization
			const user = await db.query.users.findFirst({
				where: eq(users.clerkId, ctx.userId),
			});

			if (!user) {
				throw new Error("User not found");
			}

			const membership = await db.query.organizationMembers.findFirst({
				where: and(
					eq(organizationMembers.organizationId, input.organizationId),
					eq(organizationMembers.userId, user.id),
				),
			});

			if (!membership || membership.role !== "admin") {
				throw new Error("Admin access required");
			}

			await db
				.update(integrationConnections)
				.set({ syncEnabled: input.enabled })
				.where(
					and(
						eq(integrationConnections.organizationId, input.organizationId),
						eq(integrationConnections.provider, input.provider),
					),
				);

			return { success: true };
		}),

	// Legacy endpoints for backwards compatibility with test page
	// TODO: Remove once test page is updated to use integration.linear.*
	getLinear: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const user = await db.query.users.findFirst({
				where: eq(users.clerkId, ctx.userId),
			});
			if (!user) throw new Error("User not found");

			const membership = await db.query.organizationMembers.findFirst({
				where: and(
					eq(organizationMembers.organizationId, input.organizationId),
					eq(organizationMembers.userId, user.id),
				),
			});
			if (!membership) throw new Error("Not a member of this organization");

			return db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "linear"),
				),
				columns: {
					id: true,
					externalOrgId: true,
					externalOrgName: true,
					syncEnabled: true,
					config: true,
					createdAt: true,
					updatedAt: true,
				},
			});
		}),

	getLinearTeams: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const { getLinearTeams } = await import("../../lib/integrations/linear");
			const user = await db.query.users.findFirst({
				where: eq(users.clerkId, ctx.userId),
			});
			if (!user) throw new Error("User not found");

			const membership = await db.query.organizationMembers.findFirst({
				where: and(
					eq(organizationMembers.organizationId, input.organizationId),
					eq(organizationMembers.userId, user.id),
				),
			});
			if (!membership) throw new Error("Not a member of this organization");

			return getLinearTeams(input.organizationId);
		}),

	setLinearDefaultTeam: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid(), teamId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const { setDefaultLinearTeam } = await import(
				"../../lib/integrations/linear"
			);
			const user = await db.query.users.findFirst({
				where: eq(users.clerkId, ctx.userId),
			});
			if (!user) throw new Error("User not found");

			const membership = await db.query.organizationMembers.findFirst({
				where: and(
					eq(organizationMembers.organizationId, input.organizationId),
					eq(organizationMembers.userId, user.id),
				),
			});
			if (!membership || membership.role !== "admin")
				throw new Error("Admin access required");

			await setDefaultLinearTeam(input.organizationId, input.teamId);
			return { success: true };
		}),

	disconnectLinear: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const { disconnectLinear } = await import(
				"../../lib/integrations/linear"
			);
			const user = await db.query.users.findFirst({
				where: eq(users.clerkId, ctx.userId),
			});
			if (!user) throw new Error("User not found");

			const membership = await db.query.organizationMembers.findFirst({
				where: and(
					eq(organizationMembers.organizationId, input.organizationId),
					eq(organizationMembers.userId, user.id),
				),
			});
			if (!membership || membership.role !== "admin")
				throw new Error("Admin access required");

			return disconnectLinear(input.organizationId);
		}),
} satisfies TRPCRouterRecord;
