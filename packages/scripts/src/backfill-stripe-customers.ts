/**
 * Backfill script to create Stripe customers for existing organizations
 * that don't have a stripeCustomerId yet.
 *
 * Run with: bun run backfill:stripe-customers
 */

import path from "node:path";
import { db } from "@superset/db/client";
import { members, users } from "@superset/db/schema";
import { organizations } from "@superset/db/schema/auth";
import { config } from "dotenv";
import { and, eq, isNull } from "drizzle-orm";
import Stripe from "stripe";

// Load environment variables from root .env
config({ path: path.resolve(process.cwd(), "../../.env") });

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
	console.error("[backfill] STRIPE_SECRET_KEY is not set");
	process.exit(1);
}

const stripeClient = new Stripe(STRIPE_SECRET_KEY);

async function backfillStripeCustomers() {
	console.log("[backfill] Starting Stripe customer backfill...");

	// Find all organizations without a Stripe customer
	const orgsWithoutCustomer = await db
		.select()
		.from(organizations)
		.where(isNull(organizations.stripeCustomerId));

	console.log(
		`[backfill] Found ${orgsWithoutCustomer.length} organizations without Stripe customers`,
	);

	let created = 0;
	let skipped = 0;
	let errors = 0;

	for (const org of orgsWithoutCustomer) {
		try {
			// Find the owner of the organization
			const ownerMember = await db
				.select({
					member: members,
					user: users,
				})
				.from(members)
				.innerJoin(users, eq(users.id, members.userId))
				.where(
					and(eq(members.organizationId, org.id), eq(members.role, "owner")),
				)
				.limit(1);

			const owner = ownerMember[0];
			if (!owner) {
				console.warn(`[backfill] No owner found for org ${org.id}, skipping`);
				skipped++;
				continue;
			}

			// Create Stripe customer
			const customer = await stripeClient.customers.create({
				name: org.name,
				email: owner.user.email,
				metadata: {
					organizationId: org.id,
					organizationSlug: org.slug,
					backfilled: "true",
				},
			});

			// Update organization with Stripe customer ID
			await db
				.update(organizations)
				.set({ stripeCustomerId: customer.id })
				.where(eq(organizations.id, org.id));

			console.log(
				`[backfill] Created customer ${customer.id} for org ${org.id} (${org.name})`,
			);
			created++;
		} catch (error) {
			console.error(
				`[backfill] Error creating customer for org ${org.id}:`,
				error,
			);
			errors++;
		}
	}

	console.log("\n[backfill] Backfill complete:");
	console.log(`  - Created: ${created}`);
	console.log(`  - Skipped: ${skipped}`);
	console.log(`  - Errors: ${errors}`);

	process.exit(errors > 0 ? 1 : 0);
}

backfillStripeCustomers();
