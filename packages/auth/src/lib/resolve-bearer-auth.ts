import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import { verifyAccessToken } from "better-auth/oauth2";
import { eq } from "drizzle-orm";
import { env } from "../env";
import { auth } from "../server";
import { TRPC_AUDIENCES } from "./oauth-audiences";

const apiUrl = env.NEXT_PUBLIC_API_URL;

export type BearerAuthKind = "jwt" | "apiKey";

export type BearerAuthErrorReason =
	| "invalid_token"
	| "invalid_api_key"
	| "forbidden_org";

export class BearerAuthError extends Error {
	constructor(
		public readonly reason: BearerAuthErrorReason,
		message: string,
	) {
		super(message);
		this.name = "BearerAuthError";
	}
}

export interface BearerAuthResult {
	kind: BearerAuthKind;
	userId: string;
	email?: string;
	activeOrganizationId: string | null;
	organizationIds: string[];
	scopes: string[];
}

export interface ResolveBearerAuthOptions {
	/** Defaults to {@link TRPC_AUDIENCES}. MCP routes pass `MCP_AUDIENCES`. */
	audiences?: string[];
}

function looksLikeJwt(token: string): boolean {
	const parts = token.split(".");
	return parts.length === 3 && parts.every(Boolean);
}

function isApiKey(token: string): boolean {
	return token.startsWith("sk_live_");
}

type ExtractedBearer =
	| { apiKey: string }
	| { jwt: string }
	| { malformed: "api_key" | "token" }
	| { none: true };

function extractBearer(headers: Headers): ExtractedBearer {
	// x-api-key takes precedence. Only forward our own prefix to verifyApiKey;
	// anything else with this header is malformed (rejected, not fallthrough).
	const xApiKey = headers.get("x-api-key")?.trim();
	if (xApiKey) {
		return isApiKey(xApiKey) ? { apiKey: xApiKey } : { malformed: "api_key" };
	}

	const match = headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
	const token = match?.[1]?.trim();
	if (!token) return { none: true };
	if (isApiKey(token)) return { apiKey: token };
	if (looksLikeJwt(token)) return { jwt: token };
	return { malformed: "token" };
}

function parseApiKeyMetadata(metadata: unknown): Record<string, unknown> {
	if (typeof metadata === "string") {
		try {
			const parsed = JSON.parse(metadata);
			return parsed && typeof parsed === "object"
				? (parsed as Record<string, unknown>)
				: {};
		} catch {
			return {};
		}
	}
	return metadata && typeof metadata === "object"
		? (metadata as Record<string, unknown>)
		: {};
}

async function listOrganizationIds(userId: string): Promise<string[]> {
	const rows = await db.query.members.findMany({
		where: eq(members.userId, userId),
		columns: { organizationId: true },
	});
	return [...new Set(rows.map((r) => r.organizationId))];
}

/**
 * Pick the active org: header override (validated against membership) wins,
 * otherwise the claim (from JWT / API-key metadata).
 */
function resolveActiveOrg(
	headers: Headers,
	organizationIds: string[],
	claimed: string | null,
): string | null {
	const requested = headers.get(ORGANIZATION_HEADER)?.trim() || null;
	if (!requested) return claimed;
	if (!organizationIds.includes(requested)) {
		throw new BearerAuthError(
			"forbidden_org",
			`Not a member of organization ${requested}`,
		);
	}
	return requested;
}

/**
 * Validates an `Authorization: Bearer …` JWT or an `x-api-key` header.
 *
 * Returns `null` only when no bearer is present — caller falls back to other
 * auth (e.g. cookie session). Throws `BearerAuthError` when a bearer IS
 * present but invalid or forbidden, so callers don't accidentally accept a
 * stale-token request via cookie.
 */
export async function resolveBearerAuth(
	headers: Headers,
	options: ResolveBearerAuthOptions = {},
): Promise<BearerAuthResult | null> {
	const extracted = extractBearer(headers);

	if ("malformed" in extracted) {
		throw new BearerAuthError(
			extracted.malformed === "api_key" ? "invalid_api_key" : "invalid_token",
			extracted.malformed === "api_key"
				? "Malformed API key"
				: "Malformed bearer token",
		);
	}

	if ("none" in extracted) return null;

	const apiKey = "apiKey" in extracted ? extracted.apiKey : undefined;
	const jwt = "jwt" in extracted ? extracted.jwt : undefined;

	if (apiKey) {
		const result = await auth.api.verifyApiKey({ body: { key: apiKey } });
		if (!result.valid || !result.key) {
			throw new BearerAuthError("invalid_api_key", "API key invalid");
		}
		const userId = result.key.referenceId;
		if (!userId) {
			throw new BearerAuthError(
				"invalid_api_key",
				"API key has no associated user",
			);
		}
		const metadata = parseApiKeyMetadata(result.key.metadata);
		const claimedOrg =
			typeof metadata.organizationId === "string"
				? metadata.organizationId
				: null;
		const organizationIds = await listOrganizationIds(userId);
		return {
			kind: "apiKey",
			userId,
			activeOrganizationId: resolveActiveOrg(
				headers,
				organizationIds,
				claimedOrg,
			),
			organizationIds,
			scopes: [],
		};
	}

	if (jwt) {
		let payload: Record<string, unknown>;
		try {
			payload = (await verifyAccessToken(jwt, {
				jwksUrl: `${apiUrl}/api/auth/jwks`,
				verifyOptions: {
					issuer: apiUrl,
					audience: options.audiences ?? TRPC_AUDIENCES,
				},
			})) as Record<string, unknown>;
		} catch (error) {
			throw new BearerAuthError(
				"invalid_token",
				error instanceof Error ? error.message : "JWT verification failed",
			);
		}
		const userId = typeof payload.sub === "string" ? payload.sub : null;
		if (!userId) {
			throw new BearerAuthError("invalid_token", "JWT missing sub claim");
		}
		const claimedOrg =
			typeof payload.organizationId === "string"
				? payload.organizationId
				: null;
		const scopes = Array.isArray(payload.scope)
			? (payload.scope as string[])
			: typeof payload.scope === "string"
				? payload.scope.split(" ")
				: [];
		const organizationIds = await listOrganizationIds(userId);
		return {
			kind: "jwt",
			userId,
			email: typeof payload.email === "string" ? payload.email : undefined,
			activeOrganizationId: resolveActiveOrg(
				headers,
				organizationIds,
				claimedOrg,
			),
			organizationIds,
			scopes,
		};
	}

	return null;
}
