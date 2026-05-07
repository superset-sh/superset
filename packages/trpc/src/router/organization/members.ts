import { db } from "@superset/db/client";
import { members, users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";

export const organizationMembersRouter = {
	list: protectedProcedure
		.input(
			z
				.object({
					search: z.string().min(1).nullish(),
					limit: z.number().int().positive().max(100).default(50),
				})
				.nullish(),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const conditions = [eq(members.organizationId, organizationId)];
			if (input?.search) {
				const pattern = `%${input.search}%`;
				const match = or(
					ilike(users.name, pattern),
					ilike(users.email, pattern),
				);
				if (match) conditions.push(match);
			}

			return db
				.select({
					id: users.id,
					name: users.name,
					email: users.email,
					image: users.image,
					role: members.role,
				})
				.from(members)
				.innerJoin(users, eq(members.userId, users.id))
				.where(and(...conditions))
				.limit(input?.limit ?? 50);
		}),
} satisfies TRPCRouterRecord;
