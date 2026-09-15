import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/env";

// Per-credential (or per-IP before auth) ceiling on MCP requests. Generous:
// a busy orchestrator polling terminals stays well under it; a runaway loop
// gets a 429 with Retry-After instead of degrading everyone else.
const RATE_LIMIT_REQUESTS = 600;
const RATE_LIMIT_WINDOW_SECONDS = 60;

export interface RateLimitState {
	success: boolean;
	limit: number;
	remaining: number;
	/** Epoch milliseconds when the window resets. */
	reset: number;
}

const redis = new Redis({
	url: env.KV_REST_API_URL,
	token: env.KV_REST_API_TOKEN,
});

const limiters = new Map<string, Ratelimit>();

function limiterFor(prefix: string): Ratelimit {
	let limiter = limiters.get(prefix);
	if (!limiter) {
		limiter = new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(
				RATE_LIMIT_REQUESTS,
				`${RATE_LIMIT_WINDOW_SECONDS} s`,
			),
			prefix,
		});
		limiters.set(prefix, limiter);
	}
	return limiter;
}

function rateLimitKey(req: Request): string {
	const authorization = req.headers.get("authorization") ?? "";
	const token = authorization.replace(/^Bearer\s+/i, "").trim();
	if (token) {
		const digest = createHash("sha256").update(token).digest("hex");
		return `token:${digest.slice(0, 32)}`;
	}
	const ip =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		req.headers.get("x-real-ip") ||
		"unknown";
	return `ip:${ip}`;
}

export async function checkRateLimit(
	req: Request,
	prefix = "ratelimit:mcp",
): Promise<RateLimitState | undefined> {
	try {
		const result = await limiterFor(prefix).limit(rateLimitKey(req));
		return {
			success: result.success,
			limit: result.limit,
			remaining: result.remaining,
			reset: result.reset,
		};
	} catch {
		// Redis unavailable: fail open rather than take the MCP server down.
		return undefined;
	}
}

// IETF RateLimit header fields (draft-ietf-httpapi-ratelimit-headers) plus the
// X-RateLimit-* names most SDKs already parse.
export function withRateLimitHeaders(
	response: Response,
	state: RateLimitState | undefined,
): Response {
	if (!state) return response;
	const resetInSeconds = Math.max(
		0,
		Math.ceil((state.reset - Date.now()) / 1000),
	);
	const remaining = Math.max(0, state.remaining);
	const headers = new Headers(response.headers);
	headers.set("RateLimit-Limit", String(state.limit));
	headers.set("RateLimit-Remaining", String(remaining));
	headers.set("RateLimit-Reset", String(resetInSeconds));
	headers.set(
		"RateLimit-Policy",
		`${state.limit};w=${RATE_LIMIT_WINDOW_SECONDS}`,
	);
	headers.set("X-RateLimit-Limit", String(state.limit));
	headers.set("X-RateLimit-Remaining", String(remaining));
	headers.set("X-RateLimit-Reset", String(Math.ceil(state.reset / 1000)));
	if (response.status === 429) {
		headers.set("Retry-After", String(Math.max(1, resetInSeconds)));
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export function rateLimitedResponse(): Response {
	return Response.json(
		{
			error: {
				code: "RATE_LIMITED",
				message: `Too many MCP requests: the limit is ${RATE_LIMIT_REQUESTS} per ${RATE_LIMIT_WINDOW_SECONDS} seconds per credential.`,
				hint: "Wait for the number of seconds in the Retry-After header, then retry. Batch reads where you can (for example terminals_read with a larger line count) instead of polling in a tight loop.",
			},
		},
		{ status: 429, headers: { "Content-Type": "application/json" } },
	);
}
