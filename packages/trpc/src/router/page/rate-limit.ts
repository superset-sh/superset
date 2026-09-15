import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "../../env";
import { userError } from "../../trpc";

const redis =
	env.KV_REST_API_URL && env.KV_REST_API_TOKEN
		? new Redis({ url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN })
		: null;

/**
 * On a public page the slug is the credential, and it is only six random
 * characters wide. This is what makes guessing one cost more than a loop.
 */
const publicViewRateLimit = redis
	? new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(60, "1 m"),
			prefix: "ratelimit:page:public",
		})
	: null;

export async function enforcePublicPageRead(headers: Headers): Promise<void> {
	if (!publicViewRateLimit) return;
	const ip =
		headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		headers.get("x-real-ip") ||
		"unknown";

	let success: boolean;
	try {
		({ success } = await publicViewRateLimit.limit(ip));
	} catch (error) {
		// Fail open: a Redis blip should not take every shared page down.
		console.error("[pages] public rate limiter unavailable:", error);
		return;
	}
	if (!success) {
		throw userError({
			code: "TOO_MANY_REQUESTS",
			message: "Rate limit exceeded.",
			i18nKey: "serverError.page.rateLimitExceeded",
		});
	}
}
