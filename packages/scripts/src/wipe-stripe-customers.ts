/**
 * Wipe all stripeCustomerId from organizations.
 * Run this after wiping Stripe sandbox, before running backfill.
 *
 * Run with: bun run wipe:stripe-customers
 */

import path from "node:path";
import { db } from "@superset/db/client";
import { organizations } from "@superset/db/schema/auth";
import { config } from "dotenv";
import { isNotNull } from "drizzle-orm";

// Load environment variables from root .env
config({ path: path.resolve(process.cwd(), "../../.env") });

async function wipeStripeCustomers() {
	console.log("[wipe] Wiping stripeCustomerId from all organizations...");

	const _result = await db
		.update(organizations)
		.set({ stripeCustomerId: null })
		.where(isNotNull(organizations.stripeCustomerId));

	console.log("[wipe] Done. All stripeCustomerId values cleared.");
	process.exit(0);
}

wipeStripeCustomers();
