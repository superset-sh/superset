import { createHmac, randomUUID } from "node:crypto";
import type { SentryConfig } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "../../../env";
import { userError } from "../../../i18n-error";
import {
	markDisconnected,
	type RefreshedToken,
	TokenRefreshError,
	withRefreshedToken,
} from "../token-refresh";

/**
 * The public Sentry integration's REST surface, as far as this provider needs
 * it: exchange/refresh an installation's token, verify an install, and list a
 * region's projects.
 *
 * sentry.io is the control silo (organizations, app-installation
 * authorizations); anything scoped to one organization — its projects — must
 * go to that organization's region URL.
 */
export const SENTRY_URL = "https://sentry.io";

export type SentryProject = { id: string; slug: string; name: string };

export type SentryOrganization = {
	slug: string;
	name: string;
	regionUrl: string;
};

/**
 * One organization by slug, with its region URL.
 *
 * The slug has to be passed in: an installation token is scoped to a single
 * organization but is not a member of it, so `/organizations/` — which lists
 * the caller's memberships — answers 200 with an empty array for these tokens.
 * Sentry sends the slug on the callback as `orgSlug`, which is where the one
 * this reads comes from.
 */
export async function fetchSentryOrganization(
	token: string,
	slug: string,
): Promise<SentryOrganization | null> {
	const response = await fetch(`${SENTRY_URL}/api/0/organizations/${slug}/`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!response.ok) {
		console.error(
			`[sentry] Organization lookup for ${slug} returned ${response.status}`,
		);
		return null;
	}
	const org = (await response.json()) as {
		slug: string;
		name: string;
		links?: { regionUrl?: string };
	};
	return {
		slug: org.slug,
		name: org.name,
		regionUrl: org.links?.regionUrl ?? SENTRY_URL,
	};
}

/**
 * The token grant Sentry returns from both the authorization-code exchange and
 * a refresh. Note the camelCase and `expiresAt` (an ISO date), unlike the
 * snake_case `expires_in` of most OAuth providers.
 */
export const sentryTokenResponseSchema = z.object({
	token: z.string(),
	refreshToken: z.string(),
	expiresAt: z.string(),
});
export type SentryTokenResponse = z.infer<typeof sentryTokenResponseSchema>;

function authorizationsUrl(installationUuid: string): string {
	return `${SENTRY_URL}/api/0/sentry-app-installations/${installationUuid}/authorizations/`;
}

/** Exchange the install's grant code for the first token pair. */
export async function exchangeSentryCode(params: {
	installationUuid: string;
	code: string;
}): Promise<SentryTokenResponse> {
	if (!env.SENTRY_CLIENT_ID || !env.SENTRY_CLIENT_SECRET) {
		throw new Error("Sentry app is not configured");
	}
	const response = await fetch(authorizationsUrl(params.installationUuid), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			grant_type: "authorization_code",
			code: params.code,
			client_id: env.SENTRY_CLIENT_ID,
			client_secret: env.SENTRY_CLIENT_SECRET,
		}),
	});
	if (!response.ok) {
		throw new Error(`Sentry code exchange failed: ${response.status}`);
	}
	return sentryTokenResponseSchema.parse(await response.json());
}

/** Mark an install "installed" — required when the app has Verify Install on. */
export async function verifySentryInstall(
	installationUuid: string,
	token: string,
) {
	// Best-effort: the token already works, and a failure here only leaves the
	// install in "pending" on Sentry's side.
	try {
		const response = await fetch(
			`${SENTRY_URL}/api/0/sentry-app-installations/${installationUuid}/`,
			{
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ status: "installed" }),
			},
		);
		if (!response.ok) {
			console.warn(
				`[sentry] Verify Install returned ${response.status} for ${installationUuid}`,
			);
		}
	} catch (error) {
		console.warn(
			`[sentry] Verify Install failed for ${installationUuid}:`,
			error,
		);
	}
}

/**
 * Sentry's `jwt-bearer` grant: a one-minute HS256 assertion signed with the
 * app's client secret, which refreshes an installation's token without a
 * refresh token. Sentry recommends it over `refresh_token` because that grant
 * is single-use — a rotation Sentry commits but whose response never reaches
 * us leaves the stored refresh token dead, and the connection with it.
 */
function clientSecretAssertion(clientId: string, clientSecret: string) {
	const now = Math.floor(Date.now() / 1000);
	const encode = (value: object) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
		iss: clientId,
		sub: clientId,
		iat: now,
		exp: now + 60,
		jti: randomUUID(),
	})}`;
	const signature = createHmac("sha256", clientSecret)
		.update(unsigned)
		.digest("base64url");
	return `${unsigned}.${signature}`;
}

/**
 * A usable access token for a connection, refreshing it first when it is within
 * the buffer of expiry. Public-app tokens live ~8h, so anything cached longer
 * than a session needs this.
 *
 * A failed refresh throws rather than disconnecting: the assertion needs only
 * the app's own credentials, so a rejection is a transient fault or a
 * misconfiguration, not a lost grant. An uninstall arrives on the webhook as
 * `installation.deleted`, which is what disconnects.
 */
export async function getSentryAccessToken(
	connectionId: string,
): Promise<RefreshedToken> {
	return withRefreshedToken(connectionId, {
		exchange: async (connection) => {
			const clientId = env.SENTRY_CLIENT_ID;
			const clientSecret = env.SENTRY_CLIENT_SECRET;
			if (!clientId || !clientSecret) return { keep: true };

			// The install uuid is the token endpoint's path segment; without it
			// there is nothing to refresh against, so the current token is all
			// there is.
			const installationUuid = (connection.config as SentryConfig | null)
				?.installationUuid;
			if (!installationUuid) return { keep: true };

			const response = await fetch(authorizationsUrl(installationUuid), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${clientSecretAssertion(clientId, clientSecret)}`,
				},
				body: JSON.stringify({
					grant_type: "urn:sentry:params:oauth:grant-type:jwt-bearer",
				}),
			});
			if (!response.ok) {
				throw new TokenRefreshError(
					response.status,
					await response.json().catch(() => null),
					`Sentry token refresh failed: ${response.status}`,
				);
			}
			const data = sentryTokenResponseSchema.parse(await response.json());
			return {
				accessToken: data.token,
				refreshToken: data.refreshToken,
				tokenExpiresAt: new Date(data.expiresAt),
			};
		},
	});
}

const MAX_PAGES = 10;

/** `Link: <url>; rel="next"; results="true"` is Sentry's next-page cursor. */
function nextLink(response: Response): string | null {
	const header = response.headers.get("link");
	if (!header) return null;
	for (const part of header.split(",")) {
		if (part.includes('rel="next"') && part.includes('results="true"')) {
			return part.match(/<([^>]+)>/)?.[1] ?? null;
		}
	}
	return null;
}

/** Every project in the org, following pagination. */
export async function fetchSentryProjects(
	regionUrl: string,
	organizationSlug: string,
	token: string,
): Promise<SentryProject[]> {
	const items: SentryProject[] = [];
	let cursor: string | null =
		`${regionUrl}/api/0/organizations/${encodeURIComponent(
			organizationSlug,
		)}/projects/`;
	for (let page = 0; cursor && page < MAX_PAGES; page++) {
		const response: Response = await fetch(cursor, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (response.status === 401 || response.status === 403) {
			throw userError({
				code: "UNAUTHORIZED",
				message: "Sentry rejected the token",
				i18nKey: "serverError.integration.sentryRejectedTheToken",
			});
		}
		if (!response.ok) {
			throw new TRPCError({
				code: "BAD_GATEWAY",
				message: `Sentry returned ${response.status}`,
			});
		}
		items.push(...((await response.json()) as SentryProject[]));
		cursor = nextLink(response);
	}
	return items;
}

/** Mark a connection disconnected and drop its tokens. */
export async function disconnectSentry(
	connectionId: string,
	reason: string,
): Promise<void> {
	await markDisconnected(connectionId, reason, { clearTokens: true });
}
