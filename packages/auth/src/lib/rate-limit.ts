import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
	throw new Error(
		"Missing required environment variables: KV_REST_API_URL and KV_REST_API_TOKEN",
	);
}

const redis = new Redis({
	url: process.env.KV_REST_API_URL,
	token: process.env.KV_REST_API_TOKEN,
});

// 10 invitations per hour per user
export const invitationRateLimit = new Ratelimit({
	redis,
	limiter: Ratelimit.slidingWindow(10, "1 h"),
	prefix: "ratelimit:invitation",
});
