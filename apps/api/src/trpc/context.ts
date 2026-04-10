import { auth, resolvePlanForOrganization } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { type AuthSession, createTRPCContext } from "@superset/trpc";
import { verifyAccessToken } from "better-auth/oauth2";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import {
	getBearerToken,
	isApiKeyBearerToken,
	looksLikeJwt,
	normalizeApiUrl,
	parseApiKeyMetadata,
} from "@/lib/auth-utils";

const apiUrl = normalizeApiUrl(env.NEXT_PUBLIC_API_URL);

function sessionFromClaims(
	userId: string,
	email: string,
	organizationId: string | null,
	plan: string | null,
): AuthSession {
	return {
		user: { id: userId, email },
		session: { activeOrganizationId: organizationId, plan },
	};
}

/**
 * Resolve the request principal from one of three sources, in order:
 *
 * 1. OAuth JWT (CLI, MCP-via-OAuth) — verified via JWKS, claims hold all the
 *    fields we need (`sub`, `email`, `organizationId`, `plan`).
 * 2. API key (`sk_live_...`) — verified via Better Auth, org pinned in
 *    metadata. Email is hydrated with one indexed user lookup.
 * 3. Cookie session / legacy session-token bearer — falls through to
 *    Better Auth's `getSession`, which understands cookies.
 *
 * **Bearer is authoritative.** If the request presents `Authorization: Bearer
 * <something>` and verification fails, we return null and the request becomes
 * UNAUTHORIZED. We never silently fall through to cookie auth — that would
 * authenticate the request as the browser-cookie user instead of the asserted
 * principal, mask broken JWT/API-key handling, and create principal confusion.
 */
async function resolveSession(req: Request): Promise<AuthSession | null> {
	const bearer = getBearerToken(req);

	if (bearer) {
		if (looksLikeJwt(bearer)) {
			try {
				const payload = (await verifyAccessToken(bearer, {
					jwksUrl: `${apiUrl}/api/auth/jwks`,
					verifyOptions: {
						issuer: apiUrl,
						audience: [apiUrl, `${apiUrl}/`],
					},
				})) as Record<string, unknown>;

				if (
					typeof payload.sub === "string" &&
					typeof payload.email === "string" &&
					typeof payload.organizationId === "string"
				) {
					const plan = typeof payload.plan === "string" ? payload.plan : null;
					return sessionFromClaims(
						payload.sub,
						payload.email,
						payload.organizationId,
						plan,
					);
				}
				return null; // verified but missing required claims — reject
			} catch {
				return null; // verification failed — reject
			}
		}

		if (isApiKeyBearerToken(bearer)) {
			try {
				const result = await auth.api.verifyApiKey({
					body: { key: bearer },
				});
				if (!result.valid || !result.key) return null;

				const userId = result.key.referenceId;
				const metadata = parseApiKeyMetadata(result.key.metadata);
				const orgId =
					typeof metadata?.organizationId === "string"
						? metadata.organizationId
						: null;

				if (!userId || !orgId) return null;

				const user = await db.query.users.findFirst({
					where: eq(users.id, userId),
					columns: { email: true },
				});
				if (!user) return null;

				const plan = await resolvePlanForOrganization(orgId);
				return sessionFromClaims(userId, user.email, orgId, plan);
			} catch {
				return null;
			}
		}

		// Unknown bearer format — reject explicitly.
		return null;
	}

	// No bearer at all → cookie session / legacy bearer session token (web, desktop)
	const cookieSession = await auth.api.getSession({ headers: req.headers });
	if (cookieSession?.user && cookieSession.session) {
		return sessionFromClaims(
			cookieSession.user.id,
			cookieSession.user.email,
			cookieSession.session.activeOrganizationId ?? null,
			// customSession already populated `plan` on the cookie session.
			(cookieSession.session as { plan?: string | null }).plan ?? null,
		);
	}

	return null;
}

export const createContext = async ({
	req,
}: {
	req: Request;
	resHeaders: Headers;
}) => {
	const session = await resolveSession(req);
	return createTRPCContext({
		session,
		auth,
		headers: req.headers,
	});
};
