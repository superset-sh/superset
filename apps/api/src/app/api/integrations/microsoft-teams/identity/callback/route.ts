import { microsoftCredentials } from "@superset/trpc/integrations/microsoft-teams";
import { z } from "zod";

import { env } from "@/env";
import { resolveCallback } from "@/lib/integrations/resolveCallback";
import { upsertIdentity } from "@/lib/integrations/upsertIdentity";

import { IDENTITY_REDIRECT_URI, IDENTITY_SCOPES } from "../identityFlow";

const SETTINGS_URL = `${env.NEXT_PUBLIC_WEB_URL}/integrations/microsoft-teams`;

function back(error?: string): Response {
	const url = new URL(SETTINGS_URL);
	if (error) url.searchParams.set("error", error);
	return Response.redirect(url.toString());
}

const idTokenClaims = z.object({
	aud: z.string(),
	oid: z.string().min(1),
	tid: z.string().min(1),
	name: z.string().optional(),
	preferred_username: z.string().optional(),
});

/**
 * The second leg of connecting Teams: who the consenting admin is.
 *
 * Admin consent identifies a tenant, not a person, and `me` on a Teams
 * trigger needs the person's Entra object id. So after consent the admin is
 * sent through a plain OpenID sign-in, and the id token's `oid` is linked to
 * their Superset user. The connection is already saved by the time this runs:
 * declining here costs only "Me", not the integration.
 */
export async function GET(request: Request) {
	const callback = await resolveCallback(request, {
		params: ["code"],
		redirect: back,
		denied: "identity_denied",
	});
	if (callback instanceof Response) return callback;
	const { organizationId, userId, params } = callback;

	const { clientId, clientSecret } = microsoftCredentials();
	const response = await fetch(
		"https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
		{
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: clientSecret,
				grant_type: "authorization_code",
				code: params.code,
				redirect_uri: IDENTITY_REDIRECT_URI,
				scope: IDENTITY_SCOPES,
			}),
		},
	);
	const body: unknown = await response.json().catch(() => null);
	const idToken =
		typeof body === "object" && body !== null && "id_token" in body
			? (body as { id_token?: unknown }).id_token
			: undefined;
	if (!response.ok || typeof idToken !== "string") {
		console.error("[microsoft-teams/identity] token exchange failed:", body);
		return back("identity_failed");
	}

	// Straight from the token endpoint over TLS with our client secret, so
	// the payload is trusted the same way the access token is; only the
	// audience is checked, so a token minted for another app cannot link.
	const claims = idTokenClaims.safeParse(decodeJwtPayload(idToken));
	if (!claims.success || claims.data.aud !== clientId) {
		console.error("[microsoft-teams/identity] unexpected id token claims");
		return back("identity_failed");
	}

	await upsertIdentity({
		userId,
		organizationId,
		provider: "microsoft_teams",
		externalId: claims.data.oid,
		// Entra object ids are only meaningful within their tenant.
		externalScopeId: claims.data.tid,
		handle: claims.data.preferred_username ?? null,
		displayName: claims.data.name ?? null,
	});

	return back();
}

function decodeJwtPayload(token: string): unknown {
	const payload = token.split(".")[1];
	if (!payload) return null;
	try {
		return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
	} catch {
		return null;
	}
}
