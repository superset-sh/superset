import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
	ServerNotification,
	ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { db } from "@superset/db/client";
import { agentCommands, devicePresence } from "@superset/db/schema";
import { and, eq, gt } from "drizzle-orm";
import type { McpContext } from "../../auth";

// --- Auth context ---

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification> & {
	authInfo?: AuthInfo & { extra?: { mcpContext?: McpContext } };
};

export function getMcpContext(
	extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
): McpContext {
	const ctx = (extra as ToolExtra).authInfo?.extra?.mcpContext;
	if (!ctx) {
		throw new Error("No MCP context available - authentication required");
	}
	return ctx;
}

// --- Device execution ---

export const DEVICE_ONLINE_THRESHOLD_MS = 60_000;
const POLL_INTERVAL_MS = 500;
const DEFAULT_TIMEOUT_MS = 30_000;

export async function executeOnDevice({
	ctx,
	deviceId,
	tool,
	params,
	timeout = DEFAULT_TIMEOUT_MS,
}: {
	ctx: McpContext;
	deviceId: string;
	tool: string;
	params: Record<string, unknown>;
	timeout?: number;
}) {
	const threshold = new Date(Date.now() - DEVICE_ONLINE_THRESHOLD_MS);

	const [device] = await db
		.select()
		.from(devicePresence)
		.where(
			and(
				eq(devicePresence.deviceId, deviceId),
				eq(devicePresence.organizationId, ctx.organizationId),
				gt(devicePresence.lastSeenAt, threshold),
			),
		)
		.limit(1);

	if (!device) {
		return {
			content: [
				{
					type: "text" as const,
					text: `Error: Device ${deviceId} is not online`,
				},
			],
			isError: true,
		};
	}

	if (device.userId !== ctx.userId) {
		return {
			content: [
				{
					type: "text" as const,
					text: `Error: Device ${deviceId} does not belong to you. You can only execute commands on your own devices.`,
				},
			],
			isError: true,
		};
	}

	const [cmd] = await db
		.insert(agentCommands)
		.values({
			userId: ctx.userId,
			organizationId: ctx.organizationId,
			targetDeviceId: deviceId,
			targetDeviceType: device.deviceType,
			tool,
			params,
			status: "pending",
			timeoutAt: new Date(Date.now() + timeout),
		})
		.returning();

	if (!cmd) {
		return {
			content: [
				{ type: "text" as const, text: "Error: Failed to create command" },
			],
			isError: true,
		};
	}

	const startTime = Date.now();
	while (Date.now() - startTime < timeout) {
		const [updated] = await db
			.select()
			.from(agentCommands)
			.where(eq(agentCommands.id, cmd.id))
			.limit(1);

		if (updated?.status === "completed") {
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(updated.result ?? { success: true }, null, 2),
					},
				],
			};
		}

		if (updated?.status === "failed") {
			return {
				content: [
					{
						type: "text" as const,
						text: `Error: ${updated.error ?? "Command failed"}`,
					},
				],
				isError: true,
			};
		}

		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}

	// Only update to timeout if still pending (avoid race with desktop completing it)
	await db
		.update(agentCommands)
		.set({ status: "timeout" })
		.where(
			and(eq(agentCommands.id, cmd.id), eq(agentCommands.status, "pending")),
		);

	return {
		content: [
			{
				type: "text" as const,
				text: `Error: Command timed out after ${timeout}ms`,
			},
		],
		isError: true,
	};
}
