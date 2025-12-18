import { createClerkClient } from "@clerk/backend";
import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";

import { env } from "../../../env";

const clerkClient = createClerkClient({
	secretKey: env.CLERK_SECRET_KEY,
});

async function uploadAvatar(
	imageUrl: string,
	userId: string,
): Promise<string | null> {
	try {
		const response = await fetch(imageUrl);
		if (!response.ok) return null;

		const blob = await response.blob();
		const { url } = await put(`users/${userId}/avatar.png`, blob, {
			access: "public",
			token: env.BLOB_READ_WRITE_TOKEN,
		});
		return url;
	} catch {
		return null;
	}
}

/**
 * Fetch user from Clerk and create in our database.
 * Only called when user doesn't exist locally.
 */
export async function syncUserFromClerk(clerkId: string) {
	const clerkUser = await clerkClient.users.getUser(clerkId);

	const primaryEmail = clerkUser.emailAddresses.find(
		(email) => email.id === clerkUser.primaryEmailAddressId,
	)?.emailAddress;

	if (!primaryEmail) {
		return null;
	}

	const name =
		[clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
		primaryEmail.split("@")[0] ||
		"User";

	// Upsert user - email is source of truth
	const [user] = await db
		.insert(users)
		.values({
			clerkId,
			email: primaryEmail,
			name,
		})
		.onConflictDoUpdate({
			target: users.email,
			set: {
				clerkId,
				name,
			},
		})
		.returning();

	if (!user) {
		return null;
	}

	// Upload avatar if needed
	if (!user.avatarUrl && clerkUser.imageUrl) {
		const avatarUrl = await uploadAvatar(clerkUser.imageUrl, user.id);
		if (avatarUrl) {
			await db.update(users).set({ avatarUrl }).where(eq(users.id, user.id));
			return { ...user, avatarUrl };
		}
	}

	return user;
}
