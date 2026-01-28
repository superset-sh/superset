import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "../env";

const redis = new Redis({
	url: env.KV_REST_API_URL,
	token: env.KV_REST_API_TOKEN,
});

// 10 invitations per hour per user
export const invitationRateLimit = new Ratelimit({
	redis,
	limiter: Ratelimit.slidingWindow(10, "1 h"),
	prefix: "ratelimit:invitation",
});
