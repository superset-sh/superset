import type { TRPCRouterRecord } from "@trpc/server";
import { disconnectProcedure, getConnectionProcedure } from "../connections";

export const slackRouter = {
	getConnection: getConnectionProcedure("slack", (connection) => ({
		id: connection.id,
		externalOrgName: connection.externalAccountLabel,
		connectedAt: connection.createdAt,
	})),

	disconnect: disconnectProcedure("slack"),
} satisfies TRPCRouterRecord;
