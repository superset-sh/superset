import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE, rateLimits } from "@superbuilder/drizzle";
import { TRPCError } from "@trpc/server";

export interface RateLimitConfig {
  /** Unique action identifier, e.g., "community:create" */
  action: string;
  /** Maximum number of requests within the window */
  maxRequests: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

@Injectable()
export class RateLimitService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>) {}

  /**
   * Check and consume a rate limit token.
   * Returns whether the request is allowed.
   */
  async check(identifier: string, config: RateLimitConfig): Promise<RateLimitResult> {
    // Skip if rate limiting is disabled
    if (process.env.RATE_LIMIT_ENABLED === "false") {
      return { allowed: true, remaining: config.maxRequests };
    }

    const key = `${config.action}:${identifier}`;
    const windowStart = new Date(Date.now() - config.windowSeconds * 1000);

    // Count existing entries within the window
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(rateLimits)
      .where(
        and(
          eq(rateLimits.key, key),
          gt(rateLimits.consumedAt, windowStart),
        ),
      );

    const currentCount = result?.count ?? 0;

    if (currentCount >= config.maxRequests) {
      // Find the oldest entry in the window to calculate retryAfter
      const [oldest] = await this.db
        .select({ consumedAt: rateLimits.consumedAt })
        .from(rateLimits)
        .where(
          and(
            eq(rateLimits.key, key),
            gt(rateLimits.consumedAt, windowStart),
          ),
        )
        .orderBy(rateLimits.consumedAt)
        .limit(1);

      const retryAfterSeconds = oldest
        ? Math.ceil((oldest.consumedAt.getTime() + config.windowSeconds * 1000 - Date.now()) / 1000)
        : config.windowSeconds;

      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, retryAfterSeconds),
      };
    }

    // Consume a token
    await this.db.insert(rateLimits).values({
      key,
      action: config.action,
    });

    return {
      allowed: true,
      remaining: config.maxRequests - currentCount - 1,
    };
  }

  /**
   * Check rate limit and throw TRPCError if exceeded.
   */
  async assertRateLimit(identifier: string, config: RateLimitConfig): Promise<void> {
    const result = await this.check(identifier, config);
    if (!result.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `요청이 너무 많습니다. ${result.retryAfterSeconds}초 후에 다시 시도해주세요.`,
        cause: {
          errorCode: "RATE_LIMITED",
          retryAfter: result.retryAfterSeconds,
        },
      });
    }
  }

  /**
   * Cleanup old rate limit entries (call periodically)
   */
  async cleanup(olderThanSeconds: number = 86400): Promise<void> {
    const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
    await this.db
      .delete(rateLimits)
      .where(sql`${rateLimits.consumedAt} < ${cutoff}`);
  }
}
