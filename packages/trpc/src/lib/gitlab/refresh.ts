import { db } from "@superset/db/client";
import { connections } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { env } from "../../env";
import { withRefreshedToken } from "../../router/integration/token-refresh";
import { readGitlabConfig } from "./config";
import { exchangeGitlabToken } from "./oauth-token";
import type { safeGitLabFetch } from "./transport";

export { exchangeGitlabToken } from "./oauth-token";

export interface GitlabRefreshOptions {
	organizationId?: string;
	credentials?: Parameters<typeof exchangeGitlabToken>[1];
	send?: typeof safeGitLabFetch;
}

export async function refreshGitlabToken(
	connectionId: string,
	options: GitlabRefreshOptions = {},
): Promise<
	{ disconnected: true } | { disconnected: false; accessToken: string }
> {
	const row = await db.query.connections.findFirst({
		where: and(
			eq(connections.id, connectionId),
			eq(connections.connector, "gitlab"),
			eq(connections.ownerKind, "org"),
			isNull(connections.disconnectedAt),
			...(options.organizationId
				? [eq(connections.organizationId, options.organizationId)]
				: []),
		),
	});
	if (!row || readGitlabConfig(row.state)?.auth !== "oauth")
		return { disconnected: true };
	return withRefreshedToken(connectionId, {
		acceptConnection: (connection) =>
			connection.organizationId === row.organizationId &&
			connection.connector === "gitlab" &&
			connection.ownerKind === "org" &&
			readGitlabConfig(connection.state) !== null,
		exchange: async (connection) => {
			if (readGitlabConfig(connection.state)?.auth === "token")
				return { keep: true };
			return exchangeGitlabToken(
				connection,
				options.credentials ?? {
					clientId: env.GITLAB_OAUTH_CLIENT_ID,
					clientSecret: env.GITLAB_OAUTH_CLIENT_SECRET,
					issuer: env.GITLAB_ISSUER,
				},
				options.send,
			);
		},
	});
}
