import { verifyWebhook } from "@clerk/backend/webhooks";
import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";

import { env } from "../../../../env";

async function uploadAvatar(
	imageUrl: string | undefined,
	userId: string,
): Promise<string | null> {
	if (!imageUrl) return null;

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

export async function POST(req: Request) {
	try {
		const evt = await verifyWebhook(req, {
			signingSecret: env.CLERK_WEBHOOK_SECRET,
		});

		if (evt.type === "user.created" || evt.type === "user.updated") {
			const clerkUser = evt.data;
			const primaryEmail = clerkUser.email_addresses.find(
				(email) => email.id === clerkUser.primary_email_address_id,
			)?.email_address;

			if (!primaryEmail) {
				return new Response("No primary email", { status: 200 });
			}

			const name =
				[clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(" ") ||
				primaryEmail.split("@")[0] ||
				"User";

			// Insert/update user first to get the internal UUID
			const [user] = await db
				.insert(users)
				.values({
					clerkId: clerkUser.id,
					email: primaryEmail,
					name,
				})
				.onConflictDoUpdate({
					target: users.clerkId,
					set: {
						email: primaryEmail,
						name,
					},
				})
				.returning({ id: users.id });

			// Upload avatar using internal UUID, then update user
			if (user) {
				const avatarUrl = await uploadAvatar(clerkUser.image_url, user.id);
				if (avatarUrl) {
					await db
						.update(users)
						.set({ avatarUrl })
						.where(eq(users.id, user.id));
				}
			}
		}

		if (evt.type === "user.deleted" && evt.data.id) {
			await db.delete(users).where(eq(users.clerkId, evt.data.id));
		}

		return new Response("Success", { status: 200 });
	} catch (err) {
		console.error("Webhook verification failed:", err);
		return new Response("Webhook verification failed", { status: 400 });
	}
}
