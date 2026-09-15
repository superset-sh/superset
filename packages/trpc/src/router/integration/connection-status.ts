import { db } from "@superset/db/client";
import { connections, githubInstallations } from "@superset/db/schema";
import { getConnector } from "@superset/shared/connectors";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
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
 * `getConnection` procedures.
 */
export const connectionStatusProcedure = protectedProcedure
	.input(z.object({ organizationId: z.uuid() }))
	.query(async ({ ctx, input }): Promise<Record<string, boolean>> => {
		await verifyOrgMembership(ctx.session.user.id, input.organizationId);

		const [connectorRows, installation] = await Promise.all([
			db.query.connections.findMany({
				where: and(
					eq(connections.organizationId, input.organizationId),
					isNull(connections.disconnectedAt),
				),
				columns: { connector: true, connectedByUserId: true },
			}),
			db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.organizationId, input.organizationId),
				columns: { suspended: true },
			}),
		]);

		const connected: Record<string, boolean> = {};
		for (const row of connectorRows) {
			if (
				getConnector(row.connector)?.scope === "user" &&
				row.connectedByUserId !== ctx.session.user.id
			)
				continue;
			connected[row.connector] = true;
		}

		// A suspended installation still has a row, and delivers nothing.
		connected.github = installation !== undefined && !installation.suspended;

		return connected;
	});
