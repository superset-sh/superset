import Stripe from "stripe";
import { env } from "./env";

export const isBillingEnabled = Boolean(env.STRIPE_SECRET_KEY?.trim());

export const stripeClient = new Stripe(
	(isBillingEnabled && env.STRIPE_SECRET_KEY) ||
		"sk_billing_disabled_self_host",
);
