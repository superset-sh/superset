import type { SentryConfig } from "@superset/db/schema";
import {
	connectorMethod,
	requireConnector,
	upsertConnection,
} from "@superset/trpc/connectors";
import {
	exchangeSentryCode,
	fetchSentryOrganization,
	verifySentryInstall,
} from "@superset/trpc/integrations/sentry";

import { env } from "@/env";
import { STATE_COOKIES } from "@/lib/integrations/oauthFlow";
import { resolveCallback } from "@/lib/integrations/resolveCallback";

const settingsUrl = `${env.NEXT_PUBLIC_WEB_URL}/integrations/sentry`;

/**
 * Finishes a Sentry install: exchanges the grant code for a token pair and
 * writes the connection.
 *
 * This is the authoritative path — it is the only one that knows the Superset
 * org (from the signed state cookie the connect route set). The `installation.created`
 * webhook that Sentry fires in parallel names no Superset org, so it can only
 * ever update a row this route already wrote; the two never both create.
 */
export async function GET(request: Request) {
	const callback = await resolveCallback(request, {
		params: ["code", "installationId", "orgSlug"],
		redirect: (error) => `${settingsUrl}?error=${error}`,
		cookie: STATE_COOKIES.sentry,
		// Sentry answers with no state of ours, so the cookie is the only copy.
		stateInCookieOnly: true,
	});
	if (callback instanceof Response) return callback;
	const { organizationId, userId, params, fail } = callback;
	const web = (query = "") => callback.exit(`${settingsUrl}${query}`);
	const installationId = params.installationId;

	let token: Awaited<ReturnType<typeof exchangeSentryCode>>;
	try {
		token = await exchangeSentryCode({
			installationUuid: installationId,
			code: params.code,
		});
	} catch (e) {
		console.error("[sentry/callback] Token exchange failed:", e);
		return fail("token_exchange_failed");
	}

	const organization = await fetchSentryOrganization(
		token.token,
		params.orgSlug,
	);
	if (!organization) return fail("organization_lookup_failed");

	const config: SentryConfig = {
		provider: "sentry",
		installationUuid: installationId,
		regionUrl: organization.regionUrl,
	};

	const connector = requireConnector("sentry");
	const result = await upsertConnection({
		connector,
		slug: "sentry",
		authMethod: connectorMethod(connector, "app_install").type,
		organizationId,
		userId,
		tokens: {
			accessToken: token.token,
			refreshToken: token.refreshToken,
			expiresAt: new Date(token.expiresAt),
			scopes: null,
			stored: {},
			raw: token as unknown as Record<string, unknown>,
		},
		identity: {
			account: { id: organization.slug, label: organization.name },
			user: null,
		},
		state: config,
	});
	if (result.conflict) {
		// Who holds it, so the message can name someone to ask — the blocked org
		// cannot see the other organization's connection, let alone disconnect it.
		const owner = result.conflict.ownerEmail
			? `&owner=${encodeURIComponent(result.conflict.ownerEmail)}`
			: "";
		return web(`?error=organization_already_linked${owner}`);
	}

	// Verify Install, if the app has it on; best-effort, the token already works.
	await verifySentryInstall(installationId, token.token);

	return web();
}
