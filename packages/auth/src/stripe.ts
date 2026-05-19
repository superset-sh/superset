import Stripe from "stripe";
import { env } from "./env";

let client: Stripe | null = null;

export function getStripeClient(): Stripe {
	if (client) return client;
	if (!env.STRIPE_SECRET_KEY) {
		throw new Error(
			"Stripe not configured — set STRIPE_SECRET_KEY (billing disabled in local dev)",
		);
	}
	client = new Stripe(env.STRIPE_SECRET_KEY);
	return client;
}
