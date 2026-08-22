import { integrationConnections } from "@superset/db/schema";
import { googleTokenResponseSchema } from "@superset/trpc/integrations/google";
import { Client } from "@upstash/qstash";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { resolveCallback } from "@/lib/integrations/resolveCallback";
import { upsertConnection } from "@/lib/integrations/upsertConnection";
import { upsertIdentity } from "@/lib/integrations/upsertIdentity";

const qstash = new Client({ token: env.QSTASH_TOKEN, baseUrl: env.QSTASH_URL });

const GOOGLE_CALL_TIMEOUT_MS = 10 * 1000;

const userInfoSchema = z.object({
	sub: z.string().min(1),
	email: z.string().email(),
	name: z.string().optional(),
});

const REQUIRED_SCOPES = [
	"https://www.googleapis.com/auth/calendar.readonly",
	"https://www.googleapis.com/auth/gmail.readonly",
];

function fail(reason: string): Response {
	return Response.redirect(
		`${env.NEXT_PUBLIC_WEB_URL}/integrations/google?error=${reason}`,
	);
}

export async function GET(request: Request) {
	const callback = await resolveCallback(request, {
		params: ["code"],
		redirect: fail,
	});
	if (callback instanceof Response) return callback;
	const { organizationId, userId, params } = callback;

	const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		signal: AbortSignal.timeout(GOOGLE_CALL_TIMEOUT_MS),
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: env.GOOGLE_CLIENT_ID,
			client_secret: env.GOOGLE_CLIENT_SECRET,
			redirect_uri: `${env.NEXT_PUBLIC_API_URL}/api/integrations/google/callback`,
			code: params.code,
		}),
	});
	if (!tokenResponse.ok) {
		console.error(
			"[google/callback] token exchange failed",
			tokenResponse.status,
			await tokenResponse.text(),
		);
		return fail("token_exchange_failed");
	}
	const parsedTokens = googleTokenResponseSchema.safeParse(
		await tokenResponse.json().catch(() => null),
	);
	if (!parsedTokens.success) return fail("token_exchange_failed");
	const tokens = parsedTokens.data;

	// Someone can untick a scope on the consent screen. Half a connection —
	// calendars but no mail — would save fine and then silently never fire
	// Gmail triggers, so it is refused up front.
	const granted = new Set((tokens.scope ?? "").split(" "));
	if (!REQUIRED_SCOPES.every((scope) => granted.has(scope))) {
		return fail("missing_scopes");
	}
	if (!tokens.refresh_token) return fail("no_refresh_token");

	const infoResponse = await fetch(
		"https://openidconnect.googleapis.com/v1/userinfo",
		{
			headers: { Authorization: `Bearer ${tokens.access_token}` },
			signal: AbortSignal.timeout(GOOGLE_CALL_TIMEOUT_MS),
		},
	);
	if (!infoResponse.ok) return fail("userinfo_failed");
	const parsedInfo = userInfoSchema.safeParse(
		await infoResponse.json().catch(() => null),
	);
	if (!parsedInfo.success) return fail("userinfo_failed");
	const info = parsedInfo.data;
	const email = info.email.toLowerCase();

	const result = await upsertConnection({
		organizationId,
		userId,
		provider: "google",
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
		// The account's address, not an organization: Calendar and Gmail are
		// one person's, and everything downstream treats them as theirs.
		externalOrgId: email,
		externalOrgName: email,
		config: { provider: "google" },
		// Reconnecting the same account keeps its sync tokens and channels;
		// a different account starts over. The old account's channels are
		// then unknown to the push route and expire within a week.
		configOnUpdate: sql`CASE WHEN ${integrationConnections.externalOrgId} = ${email} THEN ${integrationConnections.config} ELSE '{"provider":"google"}'::jsonb END`,
	});
	if (result.conflict) return fail("account_already_linked");

	// The identity's external id is the address rather than Google's subject
	// id, because calendar events and mail headers name people by address.
	await upsertIdentity({
		userId,
		organizationId,
		provider: "google",
		externalId: email,
		externalScopeId: null,
		handle: email,
		displayName: info.name ?? null,
		metadata: { provider: "google", sub: info.sub },
	});

	await enqueueWatchSetup(result.connectionId);

	return Response.redirect(`${env.NEXT_PUBLIC_WEB_URL}/integrations/google`);
}

/**
 * Watches are set up out of band: they take several Google calls per
 * calendar, and a failure there (an unreachable push address, say) must not
 * turn a successful authorization into an error page.
 */
async function enqueueWatchSetup(connectionId: string): Promise<void> {
	const jobUrl = `${env.NEXT_PUBLIC_API_URL}/api/integrations/google/jobs/renew-watches`;
	const body = { connectionId };
	if (env.NODE_ENV === "development") {
		fetch(jobUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}).catch((error) => {
			console.error("[google/callback] dev watch setup failed:", error);
		});
		return;
	}
	try {
		await qstash.publishJSON({ url: jobUrl, body, retries: 3 });
	} catch (error) {
		console.error("[google/callback] failed to queue watch setup:", error);
	}
}
