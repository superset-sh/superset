import type { TRPCRouterRecord } from "@trpc/server";
import { disconnectProcedure, getConnectionProcedure } from "../connections";

export const notionRouter = {
	getConnection: getConnectionProcedure("notion", (connection) => ({
		id: connection.id,
		externalOrgName: connection.externalAccountLabel,
		connectedAt: connection.createdAt,
	})),

	disconnect: disconnectProcedure("notion"),
} satisfies TRPCRouterRecord;
