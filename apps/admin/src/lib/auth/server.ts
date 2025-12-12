import "server-only";

import { createCaller, createTRPCContext } from "@superset/trpc";

import type { User } from "./types";

/**
 * Get the current user on the server.
 * Uses tRPC caller to fetch user from DB.
 *
 * Note: The proxy already validates auth and domain access,
 * so this primarily exists to get user data for display.
 *
 * Returns null if not authenticated.
 */
export async function currentUser(): Promise<User | null> {
	try {
		const ctx = await createTRPCContext({ headers: new Headers() });
		const caller = createCaller(ctx);
		const user = await caller.user.me();

		if (!user) return null;

		return {
			id: user.id,
			email: user.email,
			name: user.name,
			imageUrl: user.avatarUrl ?? undefined,
		};
	} catch {
		return null;
	}
}
