import { dbWs } from "@superset/db/client";
import { v2UsersHosts } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

// Checks whether a user has a v2_users_hosts row for the given host.
// Returns the boolean directly — use requireHostAccess when you want the
// throwing variant.
export async function hasHostAccess(
	userId: string,
	hostId: string,
): Promise<boolean> {
	const row = await dbWs.query.v2UsersHosts.findFirst({
		columns: { id: true },
		where: and(
			eq(v2UsersHosts.userId, userId),
			eq(v2UsersHosts.hostId, hostId),
		),
	});
	return !!row;
}

export async function requireHostAccess(
	userId: string,
	hostId: string,
): Promise<void> {
	if (!(await hasHostAccess(userId, hostId))) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "No access to this host",
		});
	}
}
