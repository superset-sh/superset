import { db } from "@superset/db/client";
import { members, subscriptions } from "@superset/db/schema";
import { sessions } from "@superset/db/schema/auth";
import { and, desc, eq } from "drizzle-orm";

export interface McpContext {
	userId: string;
	organizationId: string;
	role: string | null;
	plan: string | null;
	defaultDeviceId: string | null;
}

/**
 * Build MCP context from a user ID and optional organization ID
 * Used for OAuth sessions where org may be specified in token scopes
 */
export async function buildMcpContext({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId?: string;
}): Promise<McpContext | null> {
	let orgId = organizationId;

	// If no orgId provided, try to get from user's most recent session
	if (!orgId) {
		const recentSession = await db.query.sessions.findFirst({
			where: eq(sessions.userId, userId),
			orderBy: [desc(sessions.updatedAt)],
		});
		orgId = recentSession?.activeOrganizationId ?? undefined;
	}

	// If still no org, fall back to first membership
	if (!orgId) {
		const membership = await db.query.members.findFirst({
			where: eq(members.userId, userId),
		});

		if (!membership) {
			console.error("[mcp/auth] User has no organization membership:", userId);
			return null;
		}
		orgId = membership.organizationId;
	}

	// Verify user is a member of this organization
	const membership = await db.query.members.findFirst({
		where: and(eq(members.userId, userId), eq(members.organizationId, orgId)),
	});

	if (!membership) {
		console.error(
			"[mcp/auth] User is not a member of organization:",
			userId,
			orgId,
		);
		return null;
	}

	// Fetch subscription for the organization
	const subscription = await db.query.subscriptions.findFirst({
		where: and(
			eq(subscriptions.referenceId, orgId),
			eq(subscriptions.status, "active"),
		),
	});

	return {
		userId,
		organizationId: orgId,
		role: membership.role ?? null,
		plan: subscription?.plan ?? null,
		defaultDeviceId: null,
	};
}

/**
 * Create an unauthorized JSON-RPC error response with OAuth discovery headers
 */
export function createUnauthorizedResponse(): Response {
	// Get the base URL for OAuth metadata
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
				// WWW-Authenticate header tells OAuth clients where to find resource metadata
				"WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
			},
		},
	);
}
