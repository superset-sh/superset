import { eq } from "drizzle-orm";
import { db } from "../client";
import { users } from "../schema";

/**
 * A user's current email, for the server to resolve rather than take from a
 * caller. Bearer tokens carry an email claim only sometimes and only as of
 * mint time — up to a week stale on an OAuth access token — so anything
 * deciding on an address reads it here instead.
 */
export async function findUserEmail(userId: string): Promise<string | null> {
	const user = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { email: true },
	});
	return user?.email ?? null;
}
