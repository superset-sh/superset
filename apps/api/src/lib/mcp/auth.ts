import { db } from "@superset/db/client";
import { members, subscriptions } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

export interface McpContext {
	userId: string;
	organizationId: string;
	role: string | null;
	plan: string | null;
	defaultDeviceId: string | null;
}

export async function buildMcpContext({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId: string;
}): Promise<McpContext | null> {
	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.userId, userId),
			eq(members.organizationId, organizationId),
		),
	});

	if (!membership) {
		console.error(
			"[mcp/auth] User is not a member of organization:",
			userId,
			organizationId,
		);
		return null;
	}

	const subscription = await db.query.subscriptions.findFirst({
		where: and(
			eq(subscriptions.referenceId, organizationId),
			eq(subscriptions.status, "active"),
		),
	});

	return {
		userId,
		organizationId: organizationId,
		role: membership.role ?? null,
		plan: subscription?.plan ?? null,
		defaultDeviceId: null,
	};
}

export function createUnauthorizedResponse(): Response {
	const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
	const resourceMetadataUrl = `${baseUrl}/.well-known/oauth-protected-resource`;

	return new Response(
		JSON.stringify({
			jsonrpc: "2.0",
			error: {
				code: -32001,
				message: "Unauthorized: Invalid or missing credentials",
			},
			id: null,
		}),
		{
			status: 401,
			headers: {
				"Content-Type": "application/json",
				"WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
			},
		},
	);
}
