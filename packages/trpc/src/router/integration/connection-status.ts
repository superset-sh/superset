import { db } from "@superset/db/client";
import {
	githubInstallations,
	integrationConnections,
} from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { verifyOrgMembership } from "./utils";

/**
 * Which integrations this caller can actually build a trigger on.
 *
 * One procedure rather than the seven per-provider queries the settings pane
 * makes, because the trigger editor asks on every render of every row and
 * polls while the page is open. Three queries answer all of them: the
 * organization's live connections, the caller's own Google connection, and the
 * GitHub installation, which lives in its own table.
 *
 * "Connected" means the same thing here as everywhere else — a row marked
 * disconnected is not connected — so this stays in step with
 * `activeConnection` and the per-provider `getConnection` procedures.
 */
export const connectionStatusProcedure = protectedProcedure
	.input(z.object({ organizationId: z.uuid() }))
	.query(async ({ ctx, input }): Promise<Record<string, boolean>> => {
		await verifyOrgMembership(ctx.session.user.id, input.organizationId);

		const [orgConnections, googleConnection, installation] = await Promise.all([
			db.query.integrationConnections.findMany({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					isNull(integrationConnections.disconnectedAt),
				),
				columns: { provider: true },
			}),
			// Google is per member: another member's mailbox is not this caller's
			// to trigger on, so their connection must not read as connected here.
			db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "google"),
					eq(integrationConnections.connectedByUserId, ctx.session.user.id),
					isNull(integrationConnections.disconnectedAt),
				),
				columns: { id: true },
			}),
			db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.organizationId, input.organizationId),
				columns: { suspended: true },
			}),
		]);

		const connected: Record<string, boolean> = {};
		for (const row of orgConnections) connected[row.provider] = true;

		// Both overrides narrow rather than widen: the org-wide scan above would
		// otherwise report someone else's Google account as this caller's.
		connected.google = googleConnection !== undefined;
		// A suspended installation still has a row, and delivers nothing.
		connected.github = installation !== undefined && !installation.suspended;

		return connected;
	});
