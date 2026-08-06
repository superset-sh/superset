import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { handleLinearImageProxy } from "./route-core";

export async function GET(request: Request): Promise<Response> {
	return handleLinearImageProxy(request, {
		fetch,
		findLinearConnection: (organizationId) =>
			db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, organizationId),
					eq(integrationConnections.provider, "linear"),
					isNull(integrationConnections.disconnectedAt),
				),
			}),
		getSession: (headers) =>
			auth.api.getSession({
				headers,
			}),
	});
}
