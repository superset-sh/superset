import type { TRPCRouterRecord } from "@trpc/server";
import { disconnectProcedure, getConnectionProcedure } from "../connections";
import { deleteTeamsSubscriptions } from "./subscriptions";

export const microsoftTeamsRouter = {
	getConnection: getConnectionProcedure("microsoft_teams", (connection) => {
		const state =
			connection.state?.provider === "microsoft_teams"
				? connection.state
				: null;
		return {
			id: connection.id,
			tenantId: connection.externalAccountId,
			externalOrgName: connection.externalAccountLabel,
			connectedAt: connection.createdAt,
			// Whether Graph is actually delivering: a connection whose
			// subscriptions never got created is consented but deaf.
			subscriptions: {
				channelMessages: state?.subscriptions.channelMessages ?? null,
				channels: state?.subscriptions.channels ?? null,
			},
		};
	}),

	// Before the row goes: the subscription ids live on it, and Graph would
	// otherwise keep posting to the notify route for two more days.
	disconnect: disconnectProcedure("microsoft_teams", (connectionId) =>
		deleteTeamsSubscriptions(connectionId),
	),
} satisfies TRPCRouterRecord;
