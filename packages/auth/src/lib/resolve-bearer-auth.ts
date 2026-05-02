import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import { verifyAccessToken } from "better-auth/oauth2";
import { and, eq } from "drizzle-orm";
import { env } from "../env";
import { auth } from "../server";
import { VALID_OAUTH_AUDIENCES } from "./oauth-audiences";

const apiUrl = env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");

export type BearerAuthKind = "jwt" | "apiKey";

export interface BearerAuthResult {
	kind: BearerAuthKind;
	userId: string;
	email?: string;
	activeOrganizationId: string | null;
	organizationIds: string[];
	scopes: string[];
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
	const apiKey = headers.get("x-api-key")?.trim();
	if (apiKey) return { apiKey };

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
		throw new Error(`Not a member of organization ${requested}`);
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

export async function resolveBearerAuth(
	headers: Headers,
): Promise<BearerAuthResult | null> {
	const { apiKey, jwt } = extractBearer(headers);

	if (apiKey) {
		const result = await auth.api.verifyApiKey({ body: { key: apiKey } });
		if (!result.valid || !result.key) return null;

		const userId = result.key.referenceId ?? null;
		if (!userId) return null;

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
					audience: VALID_OAUTH_AUDIENCES,
				},
			})) as Record<string, unknown>;
		} catch {
			return null;
		}

		const userId = typeof payload.sub === "string" ? payload.sub : null;
		if (!userId) return null;

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
