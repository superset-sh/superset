import { Autumn } from "autumn-js";
import { env } from "./env";

export const autumnClient = env.AUTUMN_SECRET_KEY
	? new Autumn({ secretKey: env.AUTUMN_SECRET_KEY, failOpen: false })
	: null;

export const billingUsesAutumn =
	env.BILLING_PROVIDER === "autumn" && autumnClient !== null;

if (env.BILLING_PROVIDER === "autumn" && !billingUsesAutumn) {
	console.error(
		"[billing] BILLING_PROVIDER=autumn but AUTUMN_SECRET_KEY is not set; billing stays on Stripe",
	);
}
if (billingUsesAutumn && !env.AUTUMN_WEBHOOK_SECRET) {
	console.error(
		"[billing] AUTUMN_WEBHOOK_SECRET is not set; Autumn plan changes sync only from Stripe events",
	);
}
