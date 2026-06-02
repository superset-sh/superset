import { db } from "@superset/db/client";
import { members, subscriptions, users } from "@superset/db/schema";
import {
	DEV_EMAIL,
	DEV_NAME,
	DEV_PASSWORD,
} from "@superset/shared/dev-credentials";
import { and, eq } from "drizzle-orm";
import { auth } from "./server";

async function seedDevAccount(): Promise<void> {
	if (process.env.NODE_ENV !== "development") {
		throw new Error(
			"seed-dev is local-dev only; run with NODE_ENV=development",
		);
	}

	let user = await db.query.users.findFirst({
		where: eq(users.email, DEV_EMAIL),
	});
	if (user) {
		console.log(`Dev account already exists: ${DEV_EMAIL}`);
	} else {
		await auth.api.signUpEmail({
			body: { email: DEV_EMAIL, password: DEV_PASSWORD, name: DEV_NAME },
		});
		user = await db.query.users.findFirst({
			where: eq(users.email, DEV_EMAIL),
		});
		console.log(`Seeded dev account: ${DEV_EMAIL}`);
	}
	if (!user) throw new Error("dev user was not created");

	await db
		.update(users)
		.set({ onboardedAt: new Date() })
		.where(eq(users.id, user.id));

	const membership = await db.query.members.findFirst({
		where: eq(members.userId, user.id),
	});
	if (!membership) throw new Error("dev user has no organization");

	const activeSubscription = await db.query.subscriptions.findFirst({
		where: and(
			eq(subscriptions.referenceId, membership.organizationId),
			eq(subscriptions.status, "active"),
		),
	});
	if (!activeSubscription) {
		await db.insert(subscriptions).values({
			plan: "pro",
			referenceId: membership.organizationId,
			status: "active",
			billingInterval: "monthly",
			seats: 1,
		});
	}

	console.log(`Dev account ready: ${DEV_EMAIL} (onboarded, pro)`);
}

seedDevAccount()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("seed-dev failed:", error);
		process.exit(1);
	});
