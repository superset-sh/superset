import { Autumn } from "autumn-js";
import { env } from "./env";

export const autumnClient = env.AUTUMN_SECRET_KEY
	? new Autumn({ secretKey: env.AUTUMN_SECRET_KEY, failOpen: false })
	: null;

export const billingUsesAutumn =
	env.BILLING_PROVIDER === "autumn" && autumnClient !== null;
