import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@superset/db/client";
import { members, users } from "@superset/db/schema";
import { and, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { getMcpContext } from "../../utils";

export function register(server: McpServer) {
	server.registerTool(
		"list_members",
		{
			description: "List members in the organization",
			inputSchema: {
				search: z.string().optional().describe("Search by name or email"),
				limit: z.number().int().min(1).max(100).default(50),
			},
			outputSchema: {
				members: z.array(
					z.object({
						id: z.string(),
						name: z.string().nullable(),
						email: z.string(),
						image: z.string().nullable(),
						role: z.string(),
					}),
				),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const limit = args.limit as number;
			const search = args.search as string | undefined;
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
				structuredContent: { members: membersList },
				content: [
					{
						type: "text",
						text: JSON.stringify({ members: membersList }, null, 2),
					},
				],
			};
		},
	);
}
