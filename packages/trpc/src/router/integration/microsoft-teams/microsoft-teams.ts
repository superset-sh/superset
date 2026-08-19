import type { TRPCRouterRecord } from "@trpc/server";
import { disconnectProcedure, getConnectionProcedure } from "../connections";
import { deleteTeamsSubscriptions } from "./subscriptions";

export const microsoftTeamsRouter = {
	getConnection: getConnectionProcedure(
		"microsoft_teams",
		{
			id: true,
			externalOrgId: true,
			externalOrgName: true,
			config: true,
			createdAt: true,
		},
		(connection) => {
			const config =
				connection.config?.provider === "microsoft_teams"
					? connection.config
					: null;
			return {
				id: connection.id,
				tenantId: connection.externalOrgId,
				externalOrgName: connection.externalOrgName,
				connectedAt: connection.createdAt,
				// Whether Graph is actually delivering: a connection whose
				// subscriptions never got created is consented but deaf.
				subscriptions: {
					channelMessages: config?.subscriptions.channelMessages ?? null,
					channels: config?.subscriptions.channels ?? null,
				},
			};
		},
	),

	// Before the row goes: the subscription ids live on it, and Graph would
	// otherwise keep posting to the notify route for two more days.
	disconnect: disconnectProcedure("microsoft_teams", (connectionId) =>
		deleteTeamsSubscriptions(connectionId),
	),
} satisfies TRPCRouterRecord;
