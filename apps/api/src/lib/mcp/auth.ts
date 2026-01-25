import { createHash } from "node:crypto";
import { db } from "@superset/db/client";
import { apiKeys } from "@superset/db/schema";
import { eq } from "drizzle-orm";

export interface McpContext {
	userId: string;
	organizationId: string;
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

	// Update last used timestamp (fire and forget)
	db.update(apiKeys)
		.set({ lastUsedAt: new Date() })
		.where(eq(apiKeys.id, found.id))
		.catch(() => {});

	return {
		userId: found.userId,
		organizationId: found.organizationId,
		defaultDeviceId: found.defaultDeviceId,
	};
}

/**
 * Authenticate an MCP request using API key from header
 */
export async function authenticateMcpRequest(
	request: Request,
): Promise<McpContext | null> {
	const apiKey = request.headers.get("X-API-Key");

	if (!apiKey) {
		return null;
	}

	return validateApiKey(apiKey);
}

/**
 * Create an unauthorized JSON-RPC error response
 */
export function createUnauthorizedResponse(): Response {
	return new Response(
		JSON.stringify({
			jsonrpc: "2.0",
			error: {
				code: -32001,
				message: "Unauthorized: Invalid or missing API key",
			},
			id: null,
		}),
		{
			status: 401,
			headers: {
				"Content-Type": "application/json",
			},
		},
	);
}
