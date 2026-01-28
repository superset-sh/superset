/**
 * Recovery script to re-link Stripe customers to organizations
 * after a database reset. Uses organizationId from Stripe customer metadata.
 *
 * Run with: bun run recover:stripe-customers
 */

import path from "node:path";
import { db } from "@superset/db/client";
import { organizations } from "@superset/db/schema/auth";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

// Load environment variables from root .env
config({ path: path.resolve(process.cwd(), "../../.env") });

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
	console.error("[recover] STRIPE_SECRET_KEY is not set");
	process.exit(1);
}

const stripeClient = new Stripe(STRIPE_SECRET_KEY);

async function recoverStripeCustomers() {
	console.log("[recover] Starting Stripe customer recovery...");

	let linked = 0;
	let notFound = 0;
	let noMetadata = 0;
	let errors = 0;

	// Fetch all Stripe customers (paginated)
	let hasMore = true;
	let startingAfter: string | undefined;

	while (hasMore) {
		const customers = await stripeClient.customers.list({
			limit: 100,
			starting_after: startingAfter,
		});

		console.log(`[recover] Processing ${customers.data.length} customers...`);

		for (const customer of customers.data) {
			const orgId = customer.metadata?.organizationId;

			if (!orgId) {
				noMetadata++;
				continue;
			}

			try {
				// Check if organization exists
				const org = await db
					.select()
					.from(organizations)
					.where(eq(organizations.id, orgId))
					.limit(1);

				if (!org[0]) {
					console.warn(
						`[recover] Organization ${orgId} not found for customer ${customer.id}`,
					);
					notFound++;
					continue;
				}

				// Update organization with Stripe customer ID
				await db
					.update(organizations)
					.set({ stripeCustomerId: customer.id })
					.where(eq(organizations.id, orgId));

				console.log(
					`[recover] Linked customer ${customer.id} to org ${orgId} (${org[0].name})`,
				);
				linked++;
			} catch (error) {
				console.error(
					`[recover] Error linking customer ${customer.id} to org ${orgId}:`,
					error,
				);
				errors++;
			}
		}

		hasMore = customers.has_more;
		const lastCustomer = customers.data[customers.data.length - 1];
		if (hasMore && lastCustomer) {
			startingAfter = lastCustomer.id;
		}
	}

	console.log("\n[recover] Recovery complete:");
	console.log(`  - Linked: ${linked}`);
	console.log(`  - Org not found: ${notFound}`);
	console.log(`  - No metadata: ${noMetadata}`);
	console.log(`  - Errors: ${errors}`);

	process.exit(errors > 0 ? 1 : 0);
}

recoverStripeCustomers();
