import { db } from "@superset/db/client";
import { connections, type SelectConnection } from "@superset/db/schema";
import { getConnector } from "@superset/shared/connectors";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { orgConnection, userConnection } from "../../lib/connectors";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "./utils";

export function getConnectionProcedure<R>(
	connector: string,
	present: (connection: SelectConnection) => R,
) {
	return protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }): Promise<R | null> => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const connection =
				getConnector(connector)?.scope === "user"
					? await userConnection(
							input.organizationId,
							connector,
							ctx.session.user.id,
						)
					: await orgConnection(input.organizationId, connector);
			return connection ? present(connection) : null;
		});
}

export function disconnectProcedure(
	connector: string,
	before?: (connectionId: string, organizationId: string) => Promise<void>,
	beforeAll?: (organizationId: string) => Promise<void>,
) {
	return protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			// Every row, disconnected ones included: a needs-reconnect row must
			// still be removable, and a user-scoped connector can hold one per
			// member.
			const rows = await db
				.select({ id: connections.id })
				.from(connections)
				.where(
					and(
						eq(connections.organizationId, input.organizationId),
						eq(connections.connector, connector),
					),
				);
			if (rows.length === 0) {
				return { success: false, error: "No connection found" };
			}

			if (before) {
				for (const row of rows) await before(row.id, input.organizationId);
			}
			if (beforeAll) await beforeAll(input.organizationId);
			await db
				.delete(connections)
				.where(
					and(
						eq(connections.organizationId, input.organizationId),
						eq(connections.connector, connector),
					),
				);

			return { success: true };
		});
}
