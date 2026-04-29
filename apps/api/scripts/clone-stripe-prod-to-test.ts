#!/usr/bin/env bun
/**
 * Creates the same Products + Prices we use in prod inside Stripe test mode,
 * so local development uses identically-shaped data without touching prod.
 *
 * The prod plan structure is hardcoded in `PLANS` below — keep it in sync if
 * prod prices change.
 *
 * Idempotent: skips test products/prices that already match by name + amount + interval.
 *
 * Reads `STRIPE_TEST_KEY` from the workspace `.env` at the repo root.
 *
 * Usage (from repo root):
 *   bun apps/api/scripts/clone-stripe-prod-to-test.ts
 *
 * Output: prints the test-mode env vars to paste into your local `.env`.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import Stripe from "stripe";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

config({
	path: path.resolve(scriptDir, "../../../.env"),
	quiet: true,
});

interface PlanToClone {
	productName: string;
	productDescription?: string;
	prices: Array<{
		label: string;
		envVar: string;
		amount: number;
		currency: string;
		interval: "month" | "year";
	}>;
}

const PLANS: PlanToClone[] = [
	{
		productName: "Pro",
		productDescription:
			"Per-seat pricing for teams. Includes mobile app, Linear integration, team collaboration, and priority support.",
		prices: [
			{
				label: "Pro Monthly ($20/user/month)",
				envVar: "STRIPE_PRO_MONTHLY_PRICE_ID",
				amount: 2000,
				currency: "usd",
				interval: "month",
			},
			{
				label: "Pro Yearly ($15/user/month, billed yearly)",
				envVar: "STRIPE_PRO_YEARLY_PRICE_ID",
				amount: 18000,
				currency: "usd",
				interval: "year",
			},
		],
	},
	{
		productName: "Enterprise",
		prices: [
			{
				label: "Enterprise Yearly (placeholder $0)",
				envVar: "STRIPE_ENTERPRISE_YEARLY_PRICE_ID",
				amount: 0,
				currency: "usd",
				interval: "year",
			},
		],
	},
];

function assertKey(
	value: string | undefined,
	name: string,
	prefix: string,
): asserts value is string {
	if (!value) {
		console.error(`Missing env var: ${name}`);
		process.exit(1);
	}
	if (!value.startsWith(prefix)) {
		console.error(
			`${name} must start with "${prefix}" — got "${value.slice(0, 8)}..."`,
		);
		process.exit(1);
	}
}

const testKey = process.env.STRIPE_TEST_KEY;
assertKey(testKey, "STRIPE_TEST_KEY", "sk_test_");

const test = new Stripe(testKey);

async function findOrCreateTestProduct(
	plan: PlanToClone,
): Promise<Stripe.Product> {
	const existing = await test.products.list({ limit: 100 });
	const match = existing.data.find(
		(p) => p.name === plan.productName && p.active,
	);
	if (match) {
		console.log(`  ✓ test product "${plan.productName}" exists: ${match.id}`);
		return match;
	}
	const created = await test.products.create({
		name: plan.productName,
		description: plan.productDescription,
	});
	console.log(`  + created test product "${plan.productName}": ${created.id}`);
	return created;
}

async function findOrCreateTestPrice(
	productId: string,
	amount: number,
	currency: string,
	interval: "month" | "year",
): Promise<Stripe.Price> {
	const existing = await test.prices.list({ product: productId, limit: 100 });
	const match = existing.data.find(
		(p) =>
			p.unit_amount === amount &&
			p.currency === currency &&
			p.recurring?.interval === interval &&
			p.active,
	);
	if (match) return match;
	return test.prices.create({
		product: productId,
		unit_amount: amount,
		currency,
		recurring: { interval },
	});
}

async function main() {
	const testAccount = await test.accounts.retrieve();
	console.log(
		`Test account: ${testAccount.id} (${testAccount.settings?.dashboard?.display_name ?? "unknown"})`,
	);
	console.log();

	const envLines: string[] = [];

	for (const plan of PLANS) {
		console.log(`Plan: ${plan.productName}`);
		const testProduct = await findOrCreateTestProduct(plan);

		for (const price of plan.prices) {
			const testPrice = await findOrCreateTestPrice(
				testProduct.id,
				price.amount,
				price.currency,
				price.interval,
			);
			console.log(`  → ${price.label}: ${testPrice.id}`);
			envLines.push(`${price.envVar}=${testPrice.id}`);
		}
		console.log();
	}

	console.log("─".repeat(60));
	console.log("Add these to your local .env (test mode):");
	console.log();
	for (const line of envLines) console.log(line);
	console.log();
	console.log(
		"Make sure STRIPE_SECRET_KEY in your .env matches STRIPE_TEST_KEY,",
	);
	console.log(
		"then run `stripe listen --forward-to http://localhost:PORT/api/auth/stripe/webhook`",
	);
	console.log(
		"and put the printed whsec_... in STRIPE_WEBHOOK_SECRET in your .env.",
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
