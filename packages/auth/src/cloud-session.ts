import { randomBytes } from "node:crypto";
import { db } from "@superset/db/client";
import { sessions, users } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import type { auth } from "./server";

const SESSION_LIFETIME_MS = 1000 * 60 * 60 * 24 * 30;
const ONE_TIME_TOKEN_LIFETIME_MS = 1000 * 60 * 60 * 24 * 30;

export interface MintedSession {
	token: string;
	expiresAt: Date;
}

/**
 * A real session for the given user, minted directly against this branch's
 * database — the same insert
 * apps/api/src/app/api/auth/desktop/connect/route.ts does after a real OAuth
 * round trip, just without the browser hop. Shared by every dev-setup script
 * that seeds a real sign-in (desktop's, cloud mobile's, local mobile's).
 *
 * Returns null when the user has no row in this branch: expected to always
 * exist for a cloud workspace (its branch forks off production) and for a
 * local setup resolved from a real account, but a differently-seeded Neon
 * project or a deleted user must not fail the rest of setup.
 */
export async function mintSessionForUser(
	userId: string,
	activeOrganizationId: string | undefined,
): Promise<MintedSession | null> {
	const user = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { id: true },
	});
	if (!user) return null;

	const token = randomBytes(32).toString("base64url");
	const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

	await db.insert(sessions).values({
		token,
		userId,
		expiresAt,
		userAgent: "Superset Dev Sign-In",
		activeOrganizationId,
		updatedAt: new Date(),
	});

	return { token, expiresAt };
}

/**
 * A one-time token (better-auth's `oneTimeToken` plugin, dev-only — see
 * packages/auth/src/server.ts) redeemable once for `session`, so a mobile
 * build can call `authClient.oneTimeToken.verify({ token })` and sign in as
 * whoever that session belongs to.
 *
 * Written directly rather than through the plugin's own
 * `/one-time-token/generate` endpoint: that endpoint requires an existing
 * request session, and these setup scripts only have DB access, not one.
 */
export async function mintOneTimeToken(
	authInstance: typeof auth,
	session: MintedSession,
): Promise<string> {
	const token = randomBytes(32).toString("base64url");
	const context = await authInstance.$context;
	await context.internalAdapter.createVerificationValue({
		value: session.token,
		identifier: `one-time-token:${token}`,
		expiresAt: new Date(Date.now() + ONE_TIME_TOKEN_LIFETIME_MS),
	});
	return token;
}
