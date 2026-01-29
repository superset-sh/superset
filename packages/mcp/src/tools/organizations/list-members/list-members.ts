import { db } from "@superset/db/client";
import { members, users } from "@superset/db/schema";
import { and, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { registerTool } from "../../utils";

export const register = registerTool(
	"list_members",
	{
		description: "List members in the organization",
		inputSchema: {
			search: z.string().optional().describe("Search by name or email"),
			limit: z.number().int().min(1).max(100).default(50),
		},
	},
	async (params, ctx) => {
		const limit = params.limit as number;
		const search = params.search as string | undefined;
		const conditions = [eq(members.organizationId, ctx.organizationId)];

		let query = db
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
			.limit(limit);

		if (search) {
			query = db
				.select({
					id: users.id,
					name: users.name,
					email: users.email,
					image: users.image,
					role: members.role,
				})
				.from(members)
				.innerJoin(users, eq(members.userId, users.id))
				.where(
					and(
						...conditions,
						or(
							ilike(users.name, `%${search}%`),
							ilike(users.email, `%${search}%`),
						),
					),
				)
				.limit(limit);
		}

		const membersList = await query;

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({ members: membersList }, null, 2),
				},
			],
		};
	},
);
