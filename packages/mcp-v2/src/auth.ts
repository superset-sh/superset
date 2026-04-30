import { auth, mintUserJwt } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { members, users } from "@superset/db/schema";
import { verifyAccessToken } from "better-auth/oauth2";
import { eq } from "drizzle-orm";

export interface McpContext {
	userId: string;
	email: string;
	organizationId: string;
	organizationIds: string[];
	source: "api-key" | "oauth";
	clientLabel: string | null;
	requestId: string;
	bearerToken: string;
}

const MCP_UNAUTHORIZED = Symbol("MCP_UNAUTHORIZED");
export { MCP_UNAUTHORIZED };

export class McpUnauthorizedError extends Error {
	readonly tag = MCP_UNAUTHORIZED;
	constructor(message = "Unauthorized") {
		super(message);
		this.name = "McpUnauthorizedError";
	}
}

export function isMcpUnauthorized(
	error: unknown,
): error is McpUnauthorizedError {
	return (
		error instanceof Error &&
		(error as { tag?: symbol }).tag === MCP_UNAUTHORIZED
	);
}

function extractBearer(req: Request): string | undefined {
	const authorization = req.headers.get("authorization");
	const match = authorization?.match(/^Bearer\s+(.+)$/i);
	if (match?.[1]) return match[1];
	const apiKeyHeader = req.headers.get("x-api-key");
	return apiKeyHeader?.trim() || undefined;
}

function isApiKey(token: string): boolean {
	return token.startsWith("sk_");
}

function looksLikeJwt(token: string): boolean {
	const parts = token.split(".");
	return parts.length === 3 && parts.every(Boolean);
}

function parseMetadata(metadata: unknown): Record<string, unknown> | null {
	if (!metadata) return null;
	if (typeof metadata === "string") {
		try {
			const parsed = JSON.parse(metadata);
			return parsed && typeof parsed === "object"
				? (parsed as Record<string, unknown>)
				: null;
		} catch {
			return null;
		}
	}
	return typeof metadata === "object"
		? (metadata as Record<string, unknown>)
		: null;
}

async function loadUserAndOrgs(
	userId: string,
): Promise<{ email: string; organizationIds: string[] }> {
	const [user] = await db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user) {
		throw new McpUnauthorizedError("User not found");
	}
	const memberships = await db
		.select({ organizationId: members.organizationId })
		.from(members)
		.where(eq(members.userId, userId));
	const organizationIds = [
		...new Set(memberships.map((m) => m.organizationId)),
	];
	return { email: user.email, organizationIds };
}

async function resolveApiKey(token: string): Promise<{
	userId: string;
	organizationId: string;
	clientLabel: string | null;
}> {
	const result = await auth.api.verifyApiKey({ body: { key: token } });
	if (!result.valid || !result.key) {
		throw new McpUnauthorizedError("Invalid API key");
	}
	const userId = result.key.referenceId;
	if (typeof userId !== "string" || !userId) {
		throw new McpUnauthorizedError("API key missing user reference");
	}
	const metadata = parseMetadata(result.key.metadata);
	const organizationId =
		typeof metadata?.organizationId === "string"
			? metadata.organizationId
			: undefined;
	if (!organizationId) {
		throw new McpUnauthorizedError("API key missing organization scope");
	}
	const clientLabel =
		typeof metadata?.clientLabel === "string" && metadata.clientLabel
			? metadata.clientLabel
			: null;
	return { userId, organizationId, clientLabel };
}

async function resolveOAuth(
	token: string,
	apiUrl: string,
): Promise<{
	userId: string;
	organizationId: string;
	clientLabel: string | null;
}> {
	let payload: Record<string, unknown>;
	try {
		payload = (await verifyAccessToken(token, {
			jwksUrl: `${apiUrl}/api/auth/jwks`,
			verifyOptions: {
				issuer: apiUrl,
				audience: [apiUrl, `${apiUrl}/`, `${apiUrl}/api/v2/agent/mcp`],
			},
		})) as Record<string, unknown>;
	} catch {
		throw new McpUnauthorizedError("Invalid OAuth token");
	}
	if (typeof payload.sub !== "string" || !payload.sub) {
		throw new McpUnauthorizedError("OAuth token missing sub claim");
	}
	if (typeof payload.organizationId !== "string" || !payload.organizationId) {
		throw new McpUnauthorizedError("OAuth token missing organizationId claim");
	}
	const azp = typeof payload.azp === "string" ? payload.azp : null;
	return {
		userId: payload.sub,
		organizationId: payload.organizationId,
		clientLabel: azp ? mapOAuthClientId(azp) : null,
	};
}

const KNOWN_OAUTH_CLIENT_PREFIXES: Array<{ prefix: string; label: string }> = [
	{ prefix: "claude-desktop", label: "claude-desktop" },
	{ prefix: "claude-code", label: "claude-code" },
	{ prefix: "claude-ai", label: "claude-ai" },
	{ prefix: "cursor", label: "cursor" },
];

function mapOAuthClientId(clientId: string): string {
	const lower = clientId.toLowerCase();
	for (const { prefix, label } of KNOWN_OAUTH_CLIENT_PREFIXES) {
		if (lower.startsWith(prefix)) return label;
	}
	return clientId;
}

export async function resolveMcpContext(
	req: Request,
	apiUrl: string,
): Promise<McpContext> {
	const token = extractBearer(req);
	if (!token) {
		throw new McpUnauthorizedError("Missing bearer token");
	}

	let userId: string;
	let organizationId: string;
	let clientLabel: string | null;
	let source: "api-key" | "oauth";

	if (isApiKey(token)) {
		({ userId, organizationId, clientLabel } = await resolveApiKey(token));
		source = "api-key";
	} else if (looksLikeJwt(token)) {
		({ userId, organizationId, clientLabel } = await resolveOAuth(
			token,
			apiUrl,
		));
		source = "oauth";
	} else {
		throw new McpUnauthorizedError("Unrecognized token format");
	}

	const { email, organizationIds } = await loadUserAndOrgs(userId);
	if (!organizationIds.includes(organizationId)) {
		throw new McpUnauthorizedError(
			"Token references an organization the user does not belong to",
		);
	}

	const bearerToken = await mintUserJwt({
		userId,
		email,
		organizationIds,
		ttlSeconds: 300,
	});

	return {
		userId,
		email,
		organizationId,
		organizationIds,
		source,
		clientLabel,
		requestId: crypto.randomUUID(),
		bearerToken,
	};
}
