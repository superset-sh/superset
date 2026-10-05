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
export interface ProviderAccount {
	id: string;
	/** What to call this account: the nickname if it has one, else the identity. */
	label: string | null;
	/** The provider's own label, so a renamed row can still show who it is. */
	identity: string | null;
	nickname: string | null;
	needsReauth: boolean;
}

export interface ProviderConnection {
	connected: boolean;
	needsReauth: boolean;
	accounts: ProviderAccount[];
}

export const connectionStatusProcedure = protectedProcedure
	.input(z.object({ organizationId: z.uuid() }))
	.query(
		async ({ ctx, input }): Promise<Record<string, ProviderConnection>> => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const [connectorRows, installation] = await Promise.all([
				db.query.connections.findMany({
					// Oldest first, and stable: the editor pins a new trigger to the
					// first account, and an unordered read returns heap order, which
					// moves every time a row is updated — a token refresh is an update.
					orderBy: (row, { asc }) => [asc(row.createdAt), asc(row.id)],
					where: and(
						eq(connections.organizationId, input.organizationId),
						or(
							isNull(connections.disconnectedAt),
							eq(connections.disconnectReason, NEEDS_REAUTH),
						),
					),
					columns: {
						id: true,
						connector: true,
						connectedByUserId: true,
						disconnectedAt: true,
						externalAccountLabel: true,
						externalUserLabel: true,
						nickname: true,
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
				let entry = connected[row.connector];
				if (!entry) {
					entry = { connected: false, needsReauth: false, accounts: [] };
					connected[row.connector] = entry;
				}
				const identity =
					row.externalUserLabel ?? row.externalAccountLabel ?? null;
				entry.accounts.push({
					id: row.id,
					label: row.nickname ?? identity,
					identity,
					nickname: row.nickname,
					needsReauth,
				});
				// A live row wins over an expired one for the same connector.
				if (entry.connected && needsReauth) continue;
				entry.connected = !needsReauth;
				entry.needsReauth = needsReauth;
			}

			// A suspended installation still has a row, and delivers nothing.
			connected.github = {
				connected: installation !== undefined && !installation.suspended,
				needsReauth: false,
				accounts: [],
			};

			return connected;
		},
	);
