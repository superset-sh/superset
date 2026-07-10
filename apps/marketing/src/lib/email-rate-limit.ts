import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import { env } from "@/env";

type HeaderReader = {
	get(name: string): string | null;
};

const emailFormRateLimit = new Ratelimit({
	redis: new Redis({
		url: env.KV_REST_API_URL,
		token: env.KV_REST_API_TOKEN,
	}),
	limiter: Ratelimit.slidingWindow(5, "1 h"),
	prefix: "ratelimit:marketing:email-form",
});

function firstHeaderValue(value: string | null): string | null {
	return value?.split(",")[0]?.trim() || null;
}

function getClientIdentifier(requestHeaders: HeaderReader): string {
	return (
		firstHeaderValue(requestHeaders.get("cf-connecting-ip")) ??
		firstHeaderValue(requestHeaders.get("x-real-ip")) ??
		firstHeaderValue(requestHeaders.get("x-vercel-forwarded-for")) ??
		firstHeaderValue(requestHeaders.get("x-forwarded-for")) ??
		"unknown"
	);
}

export async function checkEmailFormRateLimit(email: string): Promise<boolean> {
	const requestHeaders = await headers();
	const clientIdentifier = getClientIdentifier(requestHeaders);
	const normalizedEmail = email.toLowerCase();

	const [clientLimit, emailLimit] = await Promise.all([
		emailFormRateLimit.limit(`client:${clientIdentifier}`),
		emailFormRateLimit.limit(`email:${normalizedEmail}`),
	]);

	return clientLimit.success && emailLimit.success;
}
