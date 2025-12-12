import "server-only";

import { auth, currentUser as clerkCurrentUser } from "@clerk/nextjs/server";
import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { eq } from "drizzle-orm";

import type { User } from "./types";

export async function currentUser(): Promise<User | null> {
	const { userId: clerkUserId } = await auth();

	if (!clerkUserId) return null;

	const user = await db.query.users.findFirst({
		where: eq(users.clerkId, clerkUserId),
	});

	if (!user) return null;

	return {
		id: user.id,
		email: user.email,
		name: user.name,
		imageUrl: user.avatarUrl ?? undefined,
	};
}
