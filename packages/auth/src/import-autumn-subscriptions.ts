import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import * as authSchema from "@superset/db/schema/auth";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@superset/shared/billing";
import { eq, inArray } from "drizzle-orm";
import { autumnClient } from "./autumn";
import { env } from "./env";
import {
	PRO_ANNUAL_PLAN_ID,
	PRO_MONTHLY_PLAN_ID,
	SEATS_FEATURE_ID,
} from "./lib/billing/plans";
import { stripeClient } from "./stripe";

const PLAN_BY_PRICE: Record<string, string> = {
	[env.STRIPE_PRO_MONTHLY_PRICE_ID]: PRO_MONTHLY_PLAN_ID,
	[env.STRIPE_PRO_YEARLY_PRICE_ID]: PRO_ANNUAL_PLAN_ID,
	[env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID]: "enterprise",
};

const apply = process.argv.includes("--apply");

async function main() {
	if (!autumnClient) throw new Error("AUTUMN_SECRET_KEY is not set");
	const rows = await db
		.select({
			organizationId: subscriptions.referenceId,
			stripeSubscriptionId: subscriptions.stripeSubscriptionId,
			name: authSchema.organizations.name,
			stripeCustomerId: authSchema.organizations.stripeCustomerId,
		})
		.from(subscriptions)
		.innerJoin(
			authSchema.organizations,
			eq(authSchema.organizations.id, subscriptions.referenceId),
		)
		.where(inArray(subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]));

	let imported = 0;
	const skipped: string[] = [];
	for (const row of rows) {
		if (!row.stripeSubscriptionId || !row.stripeCustomerId) {
			skipped.push(`${row.organizationId}: no Stripe ids`);
			continue;
		}
		const stripeSubscription = await stripeClient.subscriptions.retrieve(
			row.stripeSubscriptionId,
		);
		const item = stripeSubscription.items.data[0];
		const planId = item ? PLAN_BY_PRICE[item.price.id] : undefined;
		if (!item || !planId) {
			skipped.push(`${row.organizationId}: unknown price ${item?.price.id}`);
			continue;
		}
		const result = await autumnClient.billing.import({
			customerId: row.organizationId,
			customerData: { name: row.name },
			processors: [{ type: "stripe", id: row.stripeCustomerId }],
			billables: [
				{
					processor: "stripe",
					link: { subscriptionId: row.stripeSubscriptionId },
					plan: {
						planId,
						featureQuantities: [
							{ featureId: SEATS_FEATURE_ID, quantity: item.quantity ?? 1 },
						],
					},
				},
			],
			dryRun: !apply,
		});
		const mismatches = result.flashed.filter(
			(entry) => entry.mismatch || entry.skipped,
		);
		if (mismatches.length > 0) {
			skipped.push(`${row.organizationId}: ${JSON.stringify(mismatches)}`);
			continue;
		}
		imported += 1;
	}

	console.log(
		`[autumn-import] ${apply ? "imported" : "would import"} ${imported} of ${rows.length}`,
	);
	for (const line of skipped) console.log(`[autumn-import] skipped ${line}`);
}

await main();
