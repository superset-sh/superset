import type { TRPCRouterRecord } from "@trpc/server";
import { disconnectProcedure, getConnectionProcedure } from "../connections";

/**
 * A Sentry connection is a public integration the org installs through Sentry's
 * OAuth flow — the connect/callback routes under `apps/api` do the install and
 * token exchange. This router is the read/manage surface the editor and the
 * settings page use.
 */
export const sentryRouter = {
	getConnection: getConnectionProcedure("sentry", (connection) => ({
		id: connection.id,
		organizationSlug: connection.externalAccountId,
		organizationName: connection.externalAccountLabel,
		connectedAt: connection.createdAt,
	})),

	disconnect: disconnectProcedure("sentry"),
} satisfies TRPCRouterRecord;
