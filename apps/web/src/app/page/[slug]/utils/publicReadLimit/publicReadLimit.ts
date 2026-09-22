import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import { env } from "@/env";

const redis =
	env.KV_REST_API_URL && env.KV_REST_API_TOKEN
		? new Redis({ url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN })
		: null;

const publicReadRateLimit = redis
	? new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(60, "1 m"),
			prefix: "ratelimit:page:public",
		})
	: null;

export async function allowPublicRead(): Promise<boolean> {
	if (!publicReadRateLimit) return true;
	const heads = await headers();
	const ip =
		heads.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		heads.get("x-real-ip") ||
		"unknown";

	try {
		const { success } = await publicReadRateLimit.limit(ip);
		return success;
	} catch (error) {
		console.error("[pages] public rate limiter unavailable:", error);
		return true;
	}
}
