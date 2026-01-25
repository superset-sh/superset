import { createHash } from "node:crypto";
import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { apiKeys, members, subscriptions } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

export interface McpContext {
	userId: string;
	organizationId: string;
	role: string | null;
	plan: string | null;
	defaultDeviceId: string | null;
}

function hashApiKey(key: string): string {
	return createHash("sha256").update(key).digest("hex");
}

async function validateApiKey(key: string): Promise<McpContext | null> {
	if (!key.startsWith("sk_live_")) {
		return null;
	}

	const keyHash = hashApiKey(key);

	const [found] = await db
		.select({
			id: apiKeys.id,
			userId: apiKeys.userId,
			organizationId: apiKeys.organizationId,
			defaultDeviceId: apiKeys.defaultDeviceId,
			expiresAt: apiKeys.expiresAt,
			revokedAt: apiKeys.revokedAt,
		})
		.from(apiKeys)
		.where(eq(apiKeys.keyHash, keyHash))
		.limit(1);

	if (!found) {
		return null;
	}

	if (found.revokedAt) {
		return null;
	}

	if (found.expiresAt && found.expiresAt < new Date()) {
		return null;
	}

	// Fetch role and plan for the organization
	const [membership, subscription] = await Promise.all([
		db.query.members.findFirst({
			where: and(
				eq(members.userId, found.userId),
				eq(members.organizationId, found.organizationId),
			),
		}),
		db.query.subscriptions.findFirst({
			where: and(
				eq(subscriptions.referenceId, found.organizationId),
				eq(subscriptions.status, "active"),
			),
		}),
	]);

	// Update last used timestamp (fire and forget)
	db.update(apiKeys)
		.set({ lastUsedAt: new Date() })
		.where(eq(apiKeys.id, found.id))
		.catch(() => {});

	return {
		userId: found.userId,
		organizationId: found.organizationId,
		role: membership?.role ?? null,
		plan: subscription?.plan ?? null,
		defaultDeviceId: found.defaultDeviceId,
	};
}

/**
 * Validate an OAuth Bearer token and return the MCP context
 * Uses Better Auth's getMcpSession API which validates access tokens issued by the MCP plugin
 */
async function validateBearerToken(
	authHeader: string,
): Promise<McpContext | null> {
	try {
		// Use Better Auth's getMcpSession to validate the OAuth access token
		const mcpSession = await auth.api.getMcpSession({
			headers: new Headers({ Authorization: authHeader }),
		});

		if (!mcpSession) {
			return null;
		}

		// mcpSession contains the access token record with userId and scopes
		const userId = mcpSession.userId;

		// Fetch the user's active organization membership
		const membership = await db.query.members.findFirst({
			where: eq(members.userId, userId),
		});

		if (!membership) {
			console.error("[mcp/auth] User has no organization membership:", userId);
			return null;
		}

		// Fetch subscription for the organization
		const subscription = await db.query.subscriptions.findFirst({
			where: and(
				eq(subscriptions.referenceId, membership.organizationId),
				eq(subscriptions.status, "active"),
			),
		});

		return {
			userId,
			organizationId: membership.organizationId,
			role: membership.role ?? null,
			plan: subscription?.plan ?? null,
			defaultDeviceId: null,
		};
	} catch (error) {
		console.error("[mcp/auth] Bearer token validation error:", error);
		return null;
	}
}

/**
 * Authenticate an MCP request using API key or OAuth Bearer token
 */
export async function authenticateMcpRequest(
	request: Request,
): Promise<McpContext | null> {
	// Try API key first (existing auth method)
	const apiKey = request.headers.get("X-API-Key");
	if (apiKey) {
		return validateApiKey(apiKey);
	}

	// Try OAuth Bearer token
	const authHeader = request.headers.get("Authorization");
	if (authHeader?.startsWith("Bearer ")) {
		return validateBearerToken(authHeader);
	}

	return null;
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
