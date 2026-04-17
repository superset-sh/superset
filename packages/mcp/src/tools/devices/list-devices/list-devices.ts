import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@superset/db/client";
import { devicePresence, deviceTypeValues, users } from "@superset/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getMcpContext } from "../../utils";

export function register(server: McpServer) {
	server.registerTool(
		"list_devices",
		{
			description: "List registered devices in the organization.",
			inputSchema: {},
			outputSchema: {
				devices: z.array(
					z.object({
						deviceId: z.string(),
						deviceName: z.string().nullable(),
						deviceType: z.enum(deviceTypeValues),
						lastSeenAt: z.string().datetime(),
						ownerId: z.string(),
						ownerName: z.string().nullable(),
						ownerEmail: z.string(),
					}),
				),
			},
		},
		async (_args, extra) => {
			const ctx = getMcpContext(extra);

			const devices = await db
				.select({
					deviceId: devicePresence.deviceId,
					deviceName: devicePresence.deviceName,
					deviceType: devicePresence.deviceType,
					lastSeenAt: devicePresence.lastSeenAt,
					ownerId: devicePresence.userId,
					ownerName: users.name,
					ownerEmail: users.email,
				})
				.from(devicePresence)
				.innerJoin(users, eq(devicePresence.userId, users.id))
				.where(eq(devicePresence.organizationId, ctx.organizationId))
				.orderBy(desc(devicePresence.lastSeenAt));

			const result = devices.map((d) => ({
				...d,
				lastSeenAt: d.lastSeenAt.toISOString(),
			}));

			return {
				structuredContent: { devices: result },
				content: [
					{
						type: "text",
						text: JSON.stringify({ devices: result }, null, 2),
					},
				],
			};
		},
	);
}
