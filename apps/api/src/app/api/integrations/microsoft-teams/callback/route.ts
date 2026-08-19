import { randomBytes } from "node:crypto";
import { db } from "@superset/db/client";
import type { MicrosoftTeamsConfig } from "@superset/db/schema";
import { integrationConnections } from "@superset/db/schema";
import {
	acquireAppToken,
	deleteTeamsSubscriptions,
	ensureTeamsSubscriptions,
	graphRequest,
	microsoftCredentials,
} from "@superset/trpc/integrations/microsoft-teams";
import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import { posthog } from "@/lib/analytics";
import { resolveCallback } from "@/lib/integrations/resolveCallback";
import {
	connectionConflict,
	upsertConnection,
} from "@/lib/integrations/upsertConnection";
import { createSignedState } from "@/lib/oauth-state";
import {
	IDENTITY_REDIRECT_URI,
	IDENTITY_SCOPES,
} from "../identity/identityFlow";

const SETTINGS_URL = `${env.NEXT_PUBLIC_WEB_URL}/integrations/microsoft-teams`;

function fail(error: string, detail?: string): Response {
	const url = new URL(SETTINGS_URL);
	url.searchParams.set("error", error);
	if (detail) url.searchParams.set("detail", detail.slice(0, 200));
	return Response.redirect(url.toString());
}

/**
 * The tenant's display name, if the app was also granted a directory read.
 * That permission is not required for anything else, so a 403 here is the
 * common case and the tenant id stands in.
 */
async function tenantDisplayName(
	accessToken: string,
	tenantId: string,
): Promise<string> {
	try {
		const body = await graphRequest<{
			value?: Array<{ displayName?: string | null }>;
		}>(accessToken, "/organization?$select=displayName");
		return body.value?.[0]?.displayName ?? tenantId;
	} catch {
		return tenantId;
	}
}

/**
 * Where Entra sends the admin after consent. There is no code to exchange:
 * consent creates the app's service principal in the tenant, and from then on
 * the client-credentials grant against that tenant yields tokens. Getting one
 * here is what proves the tenant really consented — the `tenant` query
 * parameter on its own is attacker-controlled.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	if (url.searchParams.get("error")) {
		console.error("[microsoft-teams/callback] consent refused:", {
			error: url.searchParams.get("error"),
			description: url.searchParams.get("error_description"),
		});
		return fail("oauth_denied");
	}

	const callback = await resolveCallback(request, {
		params: ["tenant"],
		redirect: fail,
	});
	if (callback instanceof Response) return callback;
	const { organizationId, userId, params } = callback;
	const tenantId = params.tenant;

	let token: Awaited<ReturnType<typeof acquireAppToken>>;
	try {
		token = await acquireAppToken(tenantId);
	} catch (error) {
		console.error(
			"[microsoft-teams/callback] token acquisition failed:",
			error,
		);
		return fail(
			"token_exchange_failed",
			error instanceof Error ? error.message : undefined,
		);
	}

	// One tenant, one organization — checked before touching the previous
	// connection's subscriptions, so a refused reconnect leaves them running.
	const conflict = await connectionConflict(
		"microsoft_teams",
		tenantId,
		organizationId,
	);
	if (conflict) {
		return fail("tenant_already_linked", conflict.ownerEmail ?? undefined);
	}

	// A reconnect replaces the clientState below, so whatever subscriptions the
	// previous connection held would only ever be refused. Remove them from
	// Graph while their ids are still on the row.
	const previous = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "microsoft_teams"),
		),
		columns: { id: true },
	});
	if (previous) await deleteTeamsSubscriptions(previous.id);

	const config: MicrosoftTeamsConfig = {
		provider: "microsoft_teams",
		tenantId,
		// 64 hex characters, under Graph's 128 limit. Fresh on every consent,
		// so a reconnect also invalidates whatever the old subscriptions echo.
		clientState: randomBytes(32).toString("hex"),
		subscriptions: {},
	};
	const externalOrgName = await tenantDisplayName(token.accessToken, tenantId);

	const result = await upsertConnection({
		organizationId,
		userId,
		provider: "microsoft_teams",
		accessToken: token.accessToken,
		tokenExpiresAt: token.expiresAt,
		externalOrgId: tenantId,
		externalOrgName,
		config,
	});
	if (result.conflict) {
		return fail(
			"tenant_already_linked",
			result.conflict.ownerEmail ?? undefined,
		);
	}

	posthog.capture({
		distinctId: userId,
		event: "microsoft_teams_connected",
		properties: { tenant_id: tenantId },
	});

	// The connection is saved either way; the renew job retries subscriptions
	// that could not be created here. But the person who just consented is the
	// one who can fix a permission Graph refused, so tell them now.
	const ensured = await ensureTeamsSubscriptions(result.connectionId);
	const failure = ensured
		? Object.values(ensured.failures).find(Boolean)
		: "no access token";
	if (failure) {
		console.error("[microsoft-teams/callback] subscriptions:", ensured);
		return fail("subscription_failed", failure);
	}

	console.log("[microsoft-teams/callback] Connected tenant:", {
		organizationId,
		tenantId,
	});

	// Consent named the tenant; the sign-in that follows names the admin, so
	// `me` on their triggers can resolve. The connection is saved already, so
	// this leg failing loses nothing but that.
	const signIn = new URL(
		"https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
	);
	signIn.searchParams.set("client_id", microsoftCredentials().clientId);
	signIn.searchParams.set("response_type", "code");
	signIn.searchParams.set("response_mode", "query");
	signIn.searchParams.set("redirect_uri", IDENTITY_REDIRECT_URI);
	signIn.searchParams.set("scope", IDENTITY_SCOPES);
	signIn.searchParams.set(
		"state",
		createSignedState({ organizationId, userId }),
	);
	return Response.redirect(signIn.toString());
}
