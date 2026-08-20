import type { SentryConfig } from "@superset/db/schema";
import {
	exchangeSentryCode,
	fetchSentryOrganization,
	verifySentryInstall,
} from "@superset/trpc/integrations/sentry";

import { env } from "@/env";
import { resolveCallback } from "@/lib/integrations/resolveCallback";
import { upsertConnection } from "@/lib/integrations/upsertConnection";
import { SENTRY_STATE_COOKIE } from "../connect/route";

/**
 * Redirect back to the web integration page, clearing the one-shot state
 * cookie on every exit so a failed callback does not leave it live for its TTL.
 */
const web = (params = "") =>
	new Response(null, {
		status: 302,
		headers: {
			Location: `${env.NEXT_PUBLIC_WEB_URL}/integrations/sentry${params}`,
			"Set-Cookie": `${SENTRY_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/integrations/sentry; Max-Age=0`,
		},
	});

/**
 * Finishes a Sentry install: exchanges the grant code for a token pair and
 * writes the connection.
 *
 * This is the authoritative path — it is the only one that knows the Superset
 * org (from the signed cookie the connect route set). The `installation.created`
 * webhook that Sentry fires in parallel names no Superset org, so it can only
 * ever update a row this route already wrote; the two never both create.
 */
export async function GET(request: Request) {
	const callback = await resolveCallback(request, {
		params: ["code", "installationId"],
		redirect: (error) => web(`?error=${error}`),
		stateFrom: (req) =>
			readCookie(req.headers.get("cookie"), SENTRY_STATE_COOKIE),
	});
	if (callback instanceof Response) return callback;
	const { organizationId, userId, params } = callback;
	const installationId = params.installationId;

	let token: Awaited<ReturnType<typeof exchangeSentryCode>>;
	try {
		token = await exchangeSentryCode({
			installationUuid: installationId,
			code: params.code,
		});
	} catch (e) {
		console.error("[sentry/callback] Token exchange failed:", e);
		return web("?error=token_exchange_failed");
	}

	const organization = await fetchSentryOrganization(token.token);
	if (!organization) return web("?error=organization_lookup_failed");

	const config: SentryConfig = {
		provider: "sentry",
		installationUuid: installationId,
		regionUrl: organization.regionUrl,
	};

	const result = await upsertConnection({
		organizationId,
		userId,
		provider: "sentry",
		accessToken: token.token,
		refreshToken: token.refreshToken,
		tokenExpiresAt: new Date(token.expiresAt),
		externalOrgId: organization.slug,
		externalOrgName: organization.name,
		config,
	});
	if (result.conflict) return web("?error=organization_already_linked");

	// Verify Install, if the app has it on; best-effort, the token already works.
	await verifySentryInstall(installationId, token.token);

	return web();
}

/** One cookie value from a request's Cookie header. */
function readCookie(header: string | null, name: string): string | null {
	if (!header) return null;
	for (const part of header.split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key === name) return rest.join("=");
	}
	return null;
}
