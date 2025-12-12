import type { WebhookEvent } from "@clerk/backend";
import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { Webhook } from "svix";

import { env } from "../../../../env";

async function uploadAvatar(
	imageUrl: string | undefined,
	clerkId: string,
): Promise<string | null> {
	if (!imageUrl) return null;

	try {
		const response = await fetch(imageUrl);
		if (!response.ok) return null;

		const blob = await response.blob();
		const { url } = await put(`avatars/${clerkId}.jpg`, blob, {
			access: "public",
			token: env.BLOB_READ_WRITE_TOKEN,
		});
		return url;
	} catch {
		return null;
	}
}

export async function POST(req: Request) {
	const payload = await req.text();

	const svixId = req.headers.get("svix-id");
	const svixTimestamp = req.headers.get("svix-timestamp");
	const svixSignature = req.headers.get("svix-signature");

	if (!svixId || !svixTimestamp || !svixSignature) {
		return new Response("Missing webhook headers", { status: 400 });
	}

	const wh = new Webhook(env.CLERK_WEBHOOK_SECRET);
	let event: WebhookEvent;

	try {
		event = wh.verify(payload, {
			"svix-id": svixId,
			"svix-timestamp": svixTimestamp,
			"svix-signature": svixSignature,
		}) as WebhookEvent;
	} catch {
		return new Response("Invalid signature", { status: 400 });
	}

	switch (event.type) {
		case "user.created":
		case "user.updated": {
			const user = event.data;
			const primaryEmail = user.email_addresses.find(
				(email) => email.id === user.primary_email_address_id,
			)?.email_address;

			if (!primaryEmail) break;

			const name =
				[user.first_name, user.last_name].filter(Boolean).join(" ") ||
				primaryEmail.split("@")[0] ||
				"User";

			const avatarUrl = await uploadAvatar(user.image_url, user.id);

			await db
				.insert(users)
				.values({
					clerkId: user.id,
					email: primaryEmail,
					name,
					avatarUrl,
				})
				.onConflictDoUpdate({
					target: users.clerkId,
					set: {
						email: primaryEmail,
						name,
						...(avatarUrl && { avatarUrl }),
					},
				});
			break;
		}
		case "user.deleted": {
			const userId = event.data.id;
			if (userId) {
				await db.delete(users).where(eq(users.clerkId, userId));
			}
			break;
		}
	}

	return new Response("OK", { status: 200 });
}
