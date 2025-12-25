import { LinearClient } from "@linear/sdk";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { env } from "@/env";

interface LinearTokenResponse {
	access_token: string;
	token_type: string;
	expires_in?: number;
	scope: string;
}

interface StatePayload {
	organizationId: string;
	userId: string;
}

/**
 * Handle Linear OAuth callback
 *
 * GET /api/integrations/linear/callback?code=<code>&state=<state>
 *
 * Exchanges the authorization code for tokens and stores the connection.
 * Webhooks are configured at the app level in Linear's OAuth app settings,
 * not per-connection.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const error = url.searchParams.get("error");

	// Handle error from Linear
	if (error) {
		console.error("[linear/callback] OAuth error:", error);
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/settings/integrations?error=oauth_denied`,
		);
	}

	if (!code || !state) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/settings/integrations?error=missing_params`,
		);
	}

	// Decode and validate state
	let statePayload: StatePayload;
	try {
		statePayload = JSON.parse(
			Buffer.from(state, "base64url").toString("utf-8"),
		);
	} catch {
		console.error("[linear/callback] Invalid state parameter");
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/settings/integrations?error=invalid_state`,
		);
	}

	const { organizationId, userId } = statePayload;

	if (!organizationId || !userId) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/settings/integrations?error=invalid_state`,
		);
	}

	// Exchange code for tokens
	const redirectUri = `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/callback`;

	const tokenResponse = await fetch("https://api.linear.app/oauth/token", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: env.LINEAR_CLIENT_ID,
			client_secret: env.LINEAR_CLIENT_SECRET,
			redirect_uri: redirectUri,
			code,
		}),
	});

	if (!tokenResponse.ok) {
		const errorData = await tokenResponse.text();
		console.error("[linear/callback] Token exchange failed:", errorData);
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/settings/integrations?error=token_exchange_failed`,
		);
	}

	const tokenData: LinearTokenResponse = await tokenResponse.json();

	// Initialize Linear client to get organization info
	const linearClient = new LinearClient({
		accessToken: tokenData.access_token,
	});

	// Get the authenticated user's organization
	const viewer = await linearClient.viewer;
	const linearOrg = await viewer.organization;

	// Calculate token expiration (Linear tokens typically don't expire, but we'll store if provided)
	const tokenExpiresAt = tokenData.expires_in
		? new Date(Date.now() + tokenData.expires_in * 1000)
		: null;

	// Upsert the integration connection
	// Note: Webhooks are configured at the app level in Linear's OAuth settings,
	// so we don't create per-connection webhooks here.
	await db
		.insert(integrationConnections)
		.values({
			organizationId,
			connectedByUserId: userId,
			provider: "linear",
			accessToken: tokenData.access_token,
			tokenExpiresAt,
			externalOrgId: linearOrg.id,
			externalOrgName: linearOrg.name,
			syncEnabled: true,
		})
		.onConflictDoUpdate({
			target: [
				integrationConnections.organizationId,
				integrationConnections.provider,
			],
			set: {
				accessToken: tokenData.access_token,
				tokenExpiresAt,
				externalOrgId: linearOrg.id,
				externalOrgName: linearOrg.name,
				connectedByUserId: userId,
				updatedAt: new Date(),
			},
		});

	// Redirect to success page
	return Response.redirect(
		`${env.NEXT_PUBLIC_WEB_URL}/settings/integrations?success=linear_connected`,
	);
}
