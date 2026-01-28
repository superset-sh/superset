import { db } from "@superset/db/client";
import { devicePresence, users } from "@superset/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { DEVICE_ONLINE_THRESHOLD_MS, registerTool } from "../../utils";

export const register = registerTool(
	"list_devices",
	{
		description: "List online devices in the organization",
		inputSchema: {
			includeOffline: z
				.boolean()
				.default(false)
				.describe("Include recently offline devices"),
		},
	},
	async (params, ctx) => {
		const includeOffline = params.includeOffline as boolean;
		const threshold = new Date(Date.now() - DEVICE_ONLINE_THRESHOLD_MS);
		const offlineThreshold = new Date(
			Date.now() - DEVICE_ONLINE_THRESHOLD_MS * 10,
		);

		const conditions = [eq(devicePresence.organizationId, ctx.organizationId)];

		if (!includeOffline) {
			conditions.push(gt(devicePresence.lastSeenAt, threshold));
		} else {
			conditions.push(gt(devicePresence.lastSeenAt, offlineThreshold));
		}

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
			.where(and(...conditions))
			.orderBy(desc(devicePresence.lastSeenAt));

		const devicesWithStatus = devices.map((d) => ({
			...d,
			isOnline: d.lastSeenAt > threshold,
		}));

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({ devices: devicesWithStatus }, null, 2),
				},
			],
		};
	},
);
