import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@superset/db/client";
import { devicePresence, deviceTypeValues, users } from "@superset/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getMcpContext } from "../../utils";

const DEVICE_ONLINE_WINDOW_MS = 60_000;

export function register(server: McpServer) {
	server.registerTool(
		"list_devices",
		{
			description:
				"List devices in the organization. By default, only devices seen within the last 60 seconds are returned.",
			inputSchema: {
				includeOffline: z
					.boolean()
					.default(false)
					.describe("Include devices that have not checked in recently"),
			},
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
						isOnline: z.boolean(),
					}),
				),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const includeOffline = args.includeOffline === true;
			const onlineCutoff = Date.now() - DEVICE_ONLINE_WINDOW_MS;

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

			const result = devices
				.map((d) => {
					const isOnline = d.lastSeenAt.getTime() >= onlineCutoff;

					return {
						...d,
						lastSeenAt: d.lastSeenAt.toISOString(),
						isOnline,
					};
				})
				.filter((device) => includeOffline || device.isOnline);

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
