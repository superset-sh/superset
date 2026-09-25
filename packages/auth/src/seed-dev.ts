import { db } from "@superset/db/client";
import {
	members,
	oauthClients,
	subscriptions,
	users,
} from "@superset/db/schema";
import {
	DEV_EMAIL,
	DEV_NAME,
	DEV_PASSWORD,
} from "@superset/shared/dev-credentials";
import { and, eq } from "drizzle-orm";
import { env } from "./env";
import { auth } from "./server";

const CLI_CLIENT_ID = "superset-cli";
const CLI_LOOPBACK_PORTS = [51789, 51790, 51791, 51792, 51793];

const CLI_WEB_URLS = [
	...new Set(
		[process.env.SUPERSET_WEB_URL, env.NEXT_PUBLIC_WEB_URL].filter(
			(url): url is string => Boolean(url),
		),
	),
];
const CLI_REDIRECT_URIS = [
	...CLI_LOOPBACK_PORTS.map((port) => `http://127.0.0.1:${port}/callback`),
	...CLI_WEB_URLS.map((url) => new URL("/cli/auth/code", url).toString()),
];

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

async function seedCliOAuthClient(): Promise<void> {
	const registration = {
		name: "Superset CLI",
		redirectUris: CLI_REDIRECT_URIS,
		grantTypes: ["authorization_code", "refresh_token"],
		responseTypes: ["code"],
		scopes: ["openid", "profile", "email", "offline_access"],
		tokenEndpointAuthMethod: "none",
		public: true,
		disabled: false,
		updatedAt: new Date(),
	};

	const existing = await db.query.oauthClients.findFirst({
		where: eq(oauthClients.clientId, CLI_CLIENT_ID),
	});

	if (existing) {
		await db
			.update(oauthClients)
			.set(registration)
			.where(eq(oauthClients.clientId, CLI_CLIENT_ID));
		console.log(`Refreshed CLI OAuth client: ${CLI_CLIENT_ID}`);
		return;
	}

	await db.insert(oauthClients).values({
		clientId: CLI_CLIENT_ID,
		...registration,
		createdAt: new Date(),
	});
	console.log(`Seeded CLI OAuth client: ${CLI_CLIENT_ID}`);
}

seedDevAccount()
	.then(() => seedCliOAuthClient())
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("seed-dev failed:", error);
		process.exit(1);
	});
