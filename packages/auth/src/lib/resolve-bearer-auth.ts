import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import { verifyAccessToken } from "better-auth/oauth2";
import { and, eq } from "drizzle-orm";
import { env } from "../env";
import { auth } from "../server";
import { TRPC_AUDIENCES } from "./oauth-audiences";

const apiUrl = env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");

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
	/**
	 * Audiences accepted by this resource server. Tokens whose `aud` claim
	 * doesn't intersect this list are rejected. Defaults to `TRPC_AUDIENCES`
	 * (general API routes). Set to `MCP_AUDIENCES` for MCP routes.
	 */
	audiences?: string[];
}

function looksLikeJwt(token: string): boolean {
	const parts = token.split(".");
	return parts.length === 3 && parts.every(Boolean);
}

function isApiKey(token: string): boolean {
	return token.startsWith("sk_live_");
}

function extractBearer(headers: Headers): {
	apiKey?: string;
	jwt?: string;
} {
	const xApiKey = headers.get("x-api-key")?.trim();
	if (xApiKey) {
		// Only accept x-api-key values that match our prefix. An arbitrary
		// header value should not be forwarded to verifyApiKey.
		if (isApiKey(xApiKey)) return { apiKey: xApiKey };
		return {};
	}

	const authHeader = headers.get("authorization");
	const match = authHeader?.match(/^Bearer\s+(.+)$/i);
	const token = match?.[1]?.trim();
	if (!token) return {};

	if (isApiKey(token)) return { apiKey: token };
	if (looksLikeJwt(token)) return { jwt: token };
	return {};
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

async function resolveOrgFromHeader(
	headers: Headers,
	userId: string,
	fallback: string | null,
): Promise<string | null> {
	const requested = headers.get(ORGANIZATION_HEADER)?.trim() || null;
	if (!requested || requested === fallback) return fallback;

	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.userId, userId),
			eq(members.organizationId, requested),
		),
		columns: { id: true },
	});
	if (!membership) {
		throw new BearerAuthError(
			"forbidden_org",
			`Not a member of organization ${requested}`,
		);
	}
	return requested;
}

async function listOrganizationIds(userId: string): Promise<string[]> {
	const rows = await db.query.members.findMany({
		where: eq(members.userId, userId),
		columns: { organizationId: true },
	});
	return [...new Set(rows.map((r) => r.organizationId))];
}

/**
 * Validates an `Authorization: Bearer …` JWT or an `x-api-key` header.
 *
 * - Returns `null` when no bearer/api-key header is present (caller should
 *   fall back to other auth, e.g. cookie session).
 * - Throws `BearerAuthError` when a bearer IS present but invalid or
 *   forbidden — never silently falls through, so callers don't accidentally
 *   authenticate a stale-token request via cookie.
 */
export async function resolveBearerAuth(
	headers: Headers,
	options: ResolveBearerAuthOptions = {},
): Promise<BearerAuthResult | null> {
	const { apiKey, jwt } = extractBearer(headers);

	if (apiKey) {
		const result = await auth.api.verifyApiKey({ body: { key: apiKey } });
		if (!result.valid || !result.key) {
			throw new BearerAuthError("invalid_api_key", "API key invalid");
		}

		const userId = result.key.referenceId ?? null;
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

		const activeOrganizationId = await resolveOrgFromHeader(
			headers,
			userId,
			claimedOrg,
		);

		return {
			kind: "apiKey",
			userId,
			activeOrganizationId,
			organizationIds: await listOrganizationIds(userId),
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

		const activeOrganizationId = await resolveOrgFromHeader(
			headers,
			userId,
			claimedOrg,
		);

		const scopes = Array.isArray(payload.scope)
			? (payload.scope as string[])
			: typeof payload.scope === "string"
				? payload.scope.split(" ")
				: [];

		return {
			kind: "jwt",
			userId,
			email: typeof payload.email === "string" ? payload.email : undefined,
			activeOrganizationId,
			organizationIds: await listOrganizationIds(userId),
			scopes,
		};
	}

	return null;
}
