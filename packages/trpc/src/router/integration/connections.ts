import { db } from "@superset/db/client";
import {
	type IntegrationProvider,
	integrationConnections,
	type SelectIntegrationConnection,
} from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "./utils";

type ConnectionColumns = Partial<
	Record<keyof SelectIntegrationConnection, true>
>;

type Selected<C extends ConnectionColumns> = Pick<
	SelectIntegrationConnection,
	Extract<keyof C, keyof SelectIntegrationConnection>
>;

/**
 * The organization's live connection for a provider. "Is it connected" has one
 * answer everywhere: a row marked disconnected is not.
 */
export async function activeConnection<C extends ConnectionColumns>(
	organizationId: string,
	provider: IntegrationProvider,
	columns: C,
): Promise<Selected<C> | undefined> {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, provider),
			isNull(integrationConnections.disconnectedAt),
		),
		columns,
	});
	return connection as Selected<C> | undefined;
}

export function getConnectionProcedure<C extends ConnectionColumns, R>(
	provider: IntegrationProvider,
	columns: C,
	present: (connection: Selected<C>) => R,
) {
	return protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }): Promise<R | null> => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const connection = await activeConnection(
				input.organizationId,
				provider,
				columns,
			);
			return connection ? present(connection) : null;
		});
}

export function disconnectProcedure(
	provider: IntegrationProvider,
	before?: (connectionId: string, organizationId: string) => Promise<void>,
) {
	return protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			// Not activeConnection: a needs-reconnect row must still be removable.
			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, provider),
				),
				columns: { id: true },
			});
			if (!connection) {
				return { success: false, error: "No connection found" };
			}

			if (before) await before(connection.id, input.organizationId);
			await db
				.delete(integrationConnections)
				.where(eq(integrationConnections.id, connection.id));

			return { success: true };
		});
}
