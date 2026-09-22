import { db } from "@superset/db/client";
import { connections, githubInstallations } from "@superset/db/schema";
import { getConnector } from "@superset/shared/connectors";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { NEEDS_REAUTH } from "../../lib/connectors";
import { protectedProcedure } from "../../trpc";
import { verifyOrgMembership } from "./utils";

/**
 * Which integrations this caller can actually build a trigger on.
 *
 * One procedure rather than the seven per-provider queries the settings pane
 * makes, because the trigger editor asks on every render of every row and
 * polls while the page is open. Two queries answer all of them: the
 * organization's live connections, and the GitHub installation, which lives in
 * its own table.
 *
 * "Connected" means the same thing here as everywhere else — a row marked
 * disconnected is not connected — so this stays in step with the per-provider
 * `getConnection` procedures. A connection whose refresh failed is reported
 * with `needsReauth`, because a trigger built on one will not fire until the
 * user reconnects, and "not connected" would send them to the wrong button.
 */
export interface ProviderConnection {
	connected: boolean;
	needsReauth: boolean;
}

export const connectionStatusProcedure = protectedProcedure
	.input(z.object({ organizationId: z.uuid() }))
	.query(
		async ({ ctx, input }): Promise<Record<string, ProviderConnection>> => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const [connectorRows, installation] = await Promise.all([
				db.query.connections.findMany({
					where: and(
						eq(connections.organizationId, input.organizationId),
						or(
							isNull(connections.disconnectedAt),
							eq(connections.disconnectReason, NEEDS_REAUTH),
						),
					),
					columns: {
						connector: true,
						connectedByUserId: true,
						disconnectedAt: true,
					},
				}),
				db.query.githubInstallations.findFirst({
					where: eq(githubInstallations.organizationId, input.organizationId),
					columns: { suspended: true },
				}),
			]);

			const connected: Record<string, ProviderConnection> = {};
			for (const row of connectorRows) {
				if (
					getConnector(row.connector)?.scope === "user" &&
					row.connectedByUserId !== ctx.session.user.id
				)
					continue;
				const needsReauth = row.disconnectedAt !== null;
				// A live row wins over an expired one for the same connector.
				if (connected[row.connector]?.connected && needsReauth) continue;
				connected[row.connector] = { connected: !needsReauth, needsReauth };
			}

			// A suspended installation still has a row, and delivers nothing.
			connected.github = {
				connected: installation !== undefined && !installation.suspended,
				needsReauth: false,
			};

			return connected;
		},
	);
