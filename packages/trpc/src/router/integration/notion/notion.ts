import type { TRPCRouterRecord } from "@trpc/server";
import { disconnectProcedure, getConnectionProcedure } from "../connections";

export const notionRouter = {
	getConnection: getConnectionProcedure(
		"notion",
		{ id: true, externalOrgName: true, createdAt: true },
		(connection) => ({
			id: connection.id,
			externalOrgName: connection.externalOrgName,
			connectedAt: connection.createdAt,
		}),
	),

	disconnect: disconnectProcedure("notion"),
} satisfies TRPCRouterRecord;
