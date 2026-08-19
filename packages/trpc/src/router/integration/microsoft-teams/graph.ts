import { AuthError, ConfidentialClientApplication } from "@azure/msal-node";
import { Client, GraphError } from "@microsoft/microsoft-graph-client";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { withConnectionLock } from "@superset/db/utils";
import { and, eq } from "drizzle-orm";
import { env } from "../../../env";

/**
 * Microsoft Graph, app-only.
 *
 * The connection holds no user's token: it holds the app's own token for the
 * tenant that consented, acquired with the client credentials grant and cached
 * on the row until it is close to expiring. Nothing here is per user, which is
 * why teams and channels can be listed and messages fetched with no one signed
 * in on the Microsoft side.
 */

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const GRAPH_SCOPES = ["https://graph.microsoft.com/.default"];

export { GraphError };

/** The failures that mean the app can no longer act in this tenant at all. */
export function isGraphAuthError(error: unknown): boolean {
	return (
		error instanceof GraphError &&
		(error.statusCode === 401 || error.statusCode === 403)
	);
}

export function microsoftCredentials(): {
	clientId: string;
	clientSecret: string;
} {
	if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
		throw new Error("Microsoft Teams integration is not configured");
	}
	return {
		clientId: env.MICROSOFT_CLIENT_ID,
		clientSecret: env.MICROSOFT_CLIENT_SECRET,
	};
}

/**
 * Asks Entra for an app-only token in `tenantId`. Fails when the tenant has
 * not consented (the app has no service principal there) or the secret is
 * wrong; both surface as an MSAL AuthError so callers can tell them from
 * outages.
 */
export async function acquireAppToken(
	tenantId: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
	const { clientId, clientSecret } = microsoftCredentials();
	const application = new ConfidentialClientApplication({
		auth: {
			clientId,
			clientSecret,
			authority: `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}`,
		},
	});
	const result = await application.acquireTokenByClientCredential({
		scopes: GRAPH_SCOPES,
	});
	if (!result?.accessToken) {
		throw new Error("Entra returned no token for the tenant");
	}
	return {
		accessToken: result.accessToken,
		expiresAt: result.expiresOn ?? new Date(Date.now() + 60 * 60 * 1000),
	};
}

/** The tenant admin removed the app, or the secret rotated: no amount of
 * retrying gets a token. */
function isTenantRevokedError(error: unknown): error is AuthError {
	return (
		error instanceof AuthError &&
		(error.errorCode === "unauthorized_client" ||
			error.errorCode === "invalid_client" ||
			error.errorCode === "invalid_grant")
	);
}

/**
 * The cached app token for a connection, refreshed under the connection lock
 * when it is within the buffer of expiring. Null when the connection is gone
 * or has been marked disconnected.
 */
export async function getGraphAccessToken(
	connectionId: string,
): Promise<string | null> {
	return withConnectionLock(connectionId, async (tx) => {
		const [connection] = await tx
			.select({
				accessToken: integrationConnections.accessToken,
				tokenExpiresAt: integrationConnections.tokenExpiresAt,
				externalOrgId: integrationConnections.externalOrgId,
				disconnectedAt: integrationConnections.disconnectedAt,
			})
			.from(integrationConnections)
			.where(eq(integrationConnections.id, connectionId))
			.limit(1);
		if (!connection || connection.disconnectedAt || !connection.externalOrgId) {
			return null;
		}
		if (
			connection.tokenExpiresAt &&
			connection.tokenExpiresAt.getTime() > Date.now() + TOKEN_REFRESH_BUFFER_MS
		) {
			return connection.accessToken;
		}

		try {
			const token = await acquireAppToken(connection.externalOrgId);
			await tx
				.update(integrationConnections)
				.set({
					accessToken: token.accessToken,
					tokenExpiresAt: token.expiresAt,
					updatedAt: new Date(),
				})
				.where(eq(integrationConnections.id, connectionId));
			return token.accessToken;
		} catch (error) {
			if (isTenantRevokedError(error)) {
				await tx
					.update(integrationConnections)
					.set({
						disconnectedAt: new Date(),
						disconnectReason: error.errorCode,
						updatedAt: new Date(),
					})
					.where(eq(integrationConnections.id, connectionId));
				return null;
			}
			throw error;
		}
	});
}

/** The active Teams connection for an organization, or null. */
export async function findTeamsConnection(organizationId: string) {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "microsoft_teams"),
		),
	});
	if (!connection || connection.disconnectedAt) return null;
	return connection;
}

/**
 * A Graph client over a token from `getGraphAccessToken`. The SDK's default
 * middleware retries 429/503/504 honouring Retry-After.
 */
export function graphClient(accessToken: string): Client {
	return Client.initWithMiddleware({
		authProvider: { getAccessToken: async () => accessToken },
	});
}

/** One Graph GET, for callers that hold a raw token. Throws the SDK's
 * GraphError on a non-2xx. */
export function graphRequest<T>(accessToken: string, path: string): Promise<T> {
	return graphClient(accessToken).api(path).get();
}
