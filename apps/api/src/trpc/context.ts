import { auth, type Session } from "@superset/auth/server";
import { db } from "@superset/db/client";
import * as authSchema from "@superset/db/schema/auth";
import { createTRPCContext } from "@superset/trpc";
import { verifyAccessToken } from "better-auth/oauth2";
import { eq } from "drizzle-orm";
import { env } from "@/env";

const apiUrl = env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");

function looksLikeJwt(token: string): boolean {
	const parts = token.split(".");
	return parts.length === 3 && parts.every(Boolean);
}

async function sessionFromOAuthBearer(
	headers: Headers,
): Promise<Session | null> {
	const authorization = headers.get("authorization");
	const match = authorization?.match(/^Bearer\s+(.+)$/i);
	const token = match?.[1];
	if (!token || !looksLikeJwt(token)) return null;

	let payload: Record<string, unknown>;
	try {
		payload = (await verifyAccessToken(token, {
			jwksUrl: `${apiUrl}/api/auth/jwks`,
			verifyOptions: {
				issuer: apiUrl,
				audience: [apiUrl, `${apiUrl}/`],
			},
		})) as Record<string, unknown>;
	} catch {
		return null;
	}

	const userId = typeof payload.sub === "string" ? payload.sub : null;
	if (!userId) return null;

	const user = await db.query.users.findFirst({
		where: eq(authSchema.users.id, userId),
	});
	if (!user) return null;

	const activeOrganizationId =
		typeof payload.organizationId === "string" ? payload.organizationId : null;

	const sessionId = typeof payload.sid === "string" ? payload.sid : userId;

	return {
		user,
		session: {
			id: sessionId,
			userId,
			activeOrganizationId,
			expiresAt: new Date(((payload.exp as number) ?? 0) * 1000),
			token: token,
			ipAddress: null,
			userAgent: null,
			createdAt: new Date(((payload.iat as number) ?? 0) * 1000),
			updatedAt: new Date(((payload.iat as number) ?? 0) * 1000),
		},
	} as unknown as Session;
}

export const createContext = async ({
	req,
}: {
	req: Request;
	resHeaders: Headers;
}) => {
	let session = await auth.api.getSession({
		headers: req.headers,
	});

	if (!session) {
		session = await sessionFromOAuthBearer(req.headers);
	}

	return createTRPCContext({
		session,
		auth,
		headers: req.headers,
	});
};
