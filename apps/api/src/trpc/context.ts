import * as Sentry from "@sentry/nextjs";
import { auth, type Session } from "@superset/auth/server";
import { db } from "@superset/db/client";
import * as authSchema from "@superset/db/schema/auth";
import { isFirstPartyOAuthClient } from "@superset/shared/auth";
import { SANDBOX_API_CREDENTIAL_HEADER } from "@superset/shared/sandbox-gate";
import { createTRPCContext } from "@superset/trpc";
import {
	resolveSandboxCaller,
	type SandboxCaller,
} from "@superset/trpc/lib/sandbox";
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

	if (payload.azp && !isFirstPartyOAuthClient(payload.azp)) {
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

/**
 * A cloud workspace calling for itself. The credential arrives on the header
 * the sandbox firewall adds, so nothing in the box ever held it; the session
 * built here is the workspace creator's, and `sandboxCaller` is what narrows
 * the procedures it can reach.
 */
async function sessionFromSandboxCredential(
	headers: Headers,
): Promise<{ session: Session; caller: SandboxCaller } | null> {
	const caller = await resolveSandboxCaller(
		headers.get(SANDBOX_API_CREDENTIAL_HEADER),
	);
	if (!caller) return null;
	const user = await db.query.users.findFirst({
		where: eq(authSchema.users.id, caller.userId),
	});
	if (!user) return null;
	const now = new Date();
	return {
		caller,
		session: {
			user,
			session: {
				id: `sandbox:${caller.workspaceId}`,
				userId: caller.userId,
				activeOrganizationId: caller.organizationId,
				expiresAt: new Date(now.getTime() + 60_000),
				token: "",
				ipAddress: null,
				userAgent: null,
				createdAt: now,
				updatedAt: now,
			},
		} as unknown as Session,
	};
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

	const sandbox = session
		? null
		: await sessionFromSandboxCredential(req.headers);
	if (sandbox) session = sandbox.session;

	const context = createTRPCContext({
		session,
		auth,
		headers: req.headers,
		sandboxCaller: sandbox?.caller ?? null,
	});

	if (context.client) {
		Sentry.setTag(
			"client",
			`${context.client.product}/${context.client.version}`,
		);
	}

	return context;
};
