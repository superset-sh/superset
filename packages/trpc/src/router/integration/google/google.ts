import { db } from "@superset/db/client";
import { connections } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	decryptOptional,
	decryptSecret,
	userConnection,
} from "../../../lib/connectors";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgMembership } from "../utils";
import { stopChannel } from "./calendar";
import { stopMailboxWatch } from "./gmail";
import { findGoogleConnection, googleConfigOf } from "./state";

export const googleRouter = {
	getConnection: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			// The caller's own connection: Google is per member, so another
			// member's account is not this person's to see or manage.
			const connection = await userConnection(
				input.organizationId,
				"google",
				ctx.session.user.id,
				{ includeDisconnected: true },
			);
			if (!connection) return null;

			return {
				id: connection.id,
				// The Google account's address; the connection is that person's
				// calendars and mailbox, not the organization's.
				email: connection.externalAccountId,
				connectedByUserId: connection.connectedByUserId,
				connectedAt: connection.createdAt,
				needsReconnect: connection.disconnectedAt !== null,
			};
		}),

	disconnect: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const connection = await findGoogleConnection(
				input.organizationId,
				ctx.session.user.id,
			);
			if (connection) {
				// Best effort: Google keeps pushing to a channel until it is stopped
				// or expires, and the push route would only reject those with a
				// missing connection. A failure here must not block the disconnect.
				const config = googleConfigOf(connection.state);
				await Promise.allSettled([
					// The grant outlives the row unless it is revoked: without this
					// the refresh token would be gone from our side and the app would
					// still hold read access on Google's.
					revokeGrant(
						(await decryptOptional(connection.refreshToken)) ??
							(await decryptSecret(connection.accessToken)),
					),
					...Object.values(config.calendars ?? {}).flatMap((state) =>
						state.channelId && state.resourceId
							? [
									stopChannel(connection.id, {
										id: state.channelId,
										resourceId: state.resourceId,
									}),
								]
							: [],
					),
					config.gmail?.watchExpiresAt
						? stopMailboxWatch(connection.id)
						: Promise.resolve(),
				]);
			}

			const result = await db
				.delete(connections)
				.where(
					and(
						eq(connections.organizationId, input.organizationId),
						eq(connections.connector, "google"),
						eq(connections.connectedByUserId, ctx.session.user.id),
					),
				)
				.returning({ id: connections.id });

			if (result.length === 0) {
				return { success: false, error: "No connection found" };
			}
			return { success: true };
		}),
} satisfies TRPCRouterRecord;

async function revokeGrant(token: string): Promise<void> {
	await fetch(
		`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
		{ method: "POST", signal: AbortSignal.timeout(10_000) },
	);
}
