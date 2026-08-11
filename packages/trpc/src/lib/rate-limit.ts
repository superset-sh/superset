import type { ProcedureType } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "../env";

/**
 * Per-user request budgets applied to every authenticated procedure.
 * Writes get the tighter bucket; reads are cheap and chatty (clients poll a
 * lot), so they get an order of magnitude more headroom.
 */
export const MUTATION_LIMIT_PER_MINUTE = 100;
export const QUERY_LIMIT_PER_MINUTE = 1000;

export type RateLimiter = {
	limit(identifier: string): Promise<{ success: boolean }>;
};

/** Separate buckets so a burst of writes can't starve reads, and vice versa. */
export type RateLimiters = {
	mutation: RateLimiter | null;
	query: RateLimiter | null;
};

export type RateLimitSubject = {
	userId: string;
	organizationId?: string | null;
};

export function rateLimitIdentifier({
	userId,
	organizationId,
}: RateLimitSubject): string {
	return `${organizationId ?? "no-org"}:${userId}`;
}

function buildLimiters(): RateLimiters {
	if (!env.KV_REST_API_URL || !env.KV_REST_API_TOKEN) {
		return { mutation: null, query: null };
	}

	const redis = new Redis({
		url: env.KV_REST_API_URL,
		token: env.KV_REST_API_TOKEN,
	});

	return {
		mutation: new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(MUTATION_LIMIT_PER_MINUTE, "1 m"),
			prefix: "ratelimit:trpc:mutation",
		}),
		query: new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(QUERY_LIMIT_PER_MINUTE, "1 m"),
			prefix: "ratelimit:trpc:query",
		}),
	};
}

let overrides: RateLimiters | null = null;
let defaults: RateLimiters | null = null;

/**
 * Swap the limiter backend — for tests, or a deployment that isn't on Upstash.
 * Pass `null` to fall back to the env-configured Upstash limiters.
 */
export function setRateLimiters(limiters: RateLimiters | null): void {
	overrides = limiters;
}

function resolveLimiters(): RateLimiters {
	if (overrides) return overrides;
	defaults ??= buildLimiters();
	return defaults;
}

let warnedUnconfigured = false;

/**
 * Consume one unit of the caller's per-minute budget for `type`.
 *
 * Deliberately fails open: this guards every authenticated procedure, so a
 * missing KV config or a Redis blip must degrade to "unprotected" rather than
 * take the whole API down. Endpoints that need a hard guarantee (support
 * email, invitations) keep their own stricter, fail-closed limiter on top.
 */
export async function enforceRateLimit(opts: {
	type: ProcedureType;
	path: string;
	subject: RateLimitSubject;
}): Promise<void> {
	const limiters = resolveLimiters();
	const limiter = opts.type === "mutation" ? limiters.mutation : limiters.query;

	if (!limiter) {
		if (!warnedUnconfigured) {
			warnedUnconfigured = true;
			console.warn(
				"[trpc/rate-limit] disabled: KV_REST_API_URL/KV_REST_API_TOKEN are not set",
			);
		}
		return;
	}

	let success: boolean;
	try {
		({ success } = await limiter.limit(rateLimitIdentifier(opts.subject)));
	} catch (error) {
		console.error(
			`[trpc/rate-limit] ${opts.path} check failed, allowing request`,
			error,
		);
		return;
	}

	if (!success) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: "Too many requests. Please slow down and try again shortly.",
		});
	}
}
