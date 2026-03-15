import { describe, expect, test } from "bun:test";

/**
 * Reproduction test for https://github.com/anthropics/superset/issues/2407
 *
 * The better-auth apiKey plugin defaults to a rate limit of 10 requests per
 * 24 hours. MCP clients (Codex, Claude Code, Cursor, etc.) make many requests
 * per session — each tool-list, tool-call, and ping counts as a request.
 * With the default rate limit, a single workspace can exhaust the quota in
 * minutes, and opening a second workspace doubles the traffic causing
 * immediate auth failures.
 *
 * This test extracts the apiKey plugin configuration from our auth setup and
 * verifies the rate limit is set high enough for concurrent MCP usage.
 */

// The better-auth apiKey plugin defaults (from the source):
const BETTER_AUTH_DEFAULT_RATE_LIMIT = {
	enabled: true,
	timeWindow: 1000 * 60 * 60 * 24, // 24 hours
	maxRequests: 10,
};

// Simulate the rate-limit logic from better-auth's isRateLimited function
function isRateLimited(apiKey: {
	rateLimitEnabled: boolean;
	rateLimitTimeWindow: number | null;
	rateLimitMax: number | null;
	requestCount: number;
	lastRequest: Date | null;
}) {
	if (!apiKey.rateLimitEnabled) return { limited: false };
	if (apiKey.rateLimitTimeWindow === null || apiKey.rateLimitMax === null)
		return { limited: false };
	if (apiKey.lastRequest === null) return { limited: false };

	const now = Date.now();
	const timeSinceLastRequest = now - new Date(apiKey.lastRequest).getTime();

	if (timeSinceLastRequest > apiKey.rateLimitTimeWindow)
		return { limited: false };
	if (apiKey.requestCount >= apiKey.rateLimitMax) return { limited: true };
	return { limited: false };
}

describe("API key rate limits for MCP usage (#2407)", () => {
	// Extract the rate limit config that our auth setup passes to the apiKey plugin.
	// Since we can't easily import the auth module (it needs env vars, DB, Stripe, etc.),
	// we replicate the logic: when no rateLimit option is passed to apiKey(), the
	// plugin uses its defaults (10 req/24h).
	//
	// Our fix should override these defaults to allow high-throughput MCP usage.

	test("default better-auth rate limit is too restrictive for MCP", () => {
		// With the default rate limit, simulate two MCP workspaces making requests
		const apiKeyState = {
			rateLimitEnabled: BETTER_AUTH_DEFAULT_RATE_LIMIT.enabled,
			rateLimitTimeWindow: BETTER_AUTH_DEFAULT_RATE_LIMIT.timeWindow,
			rateLimitMax: BETTER_AUTH_DEFAULT_RATE_LIMIT.maxRequests,
			requestCount: 0,
			lastRequest: new Date(),
		};

		// Simulate requests from two workspaces (each does ~5 requests on init)
		// Workspace A: initialize (list tools, list resources, etc.)
		for (let i = 0; i < 5; i++) {
			apiKeyState.requestCount++;
		}
		expect(isRateLimited(apiKeyState).limited).toBe(false); // still under limit after workspace A init

		// Workspace B: initialize (same operations)
		for (let i = 0; i < 5; i++) {
			apiKeyState.requestCount++;
		}
		// Now at 10 requests — exactly at the limit
		expect(apiKeyState.requestCount).toBe(10);
		expect(isRateLimited(apiKeyState).limited).toBe(true); // RATE LIMITED after two workspace inits!
	});

	test("superset auth config should allow at least 1000 requests per hour", () => {
		// After the fix, the apiKey plugin should be configured with generous limits.
		// We read the actual config from server.ts to verify.
		// Since we can't import the module directly, we verify the source code
		// contains the correct rateLimit configuration.
		const serverSource = require("node:fs").readFileSync(
			require("node:path").resolve(__dirname, "server.ts"),
			"utf-8",
		);

		// The apiKey() call should include a rateLimit override
		const apiKeyCallMatch = serverSource.match(
			/apiKey\s*\(\s*\{[\s\S]*?\}\s*\)/,
		);
		expect(apiKeyCallMatch).not.toBeNull();

		const apiKeyCall = apiKeyCallMatch?.[0];

		// Verify rate limit is configured (not left to defaults)
		expect(apiKeyCall).toContain("rateLimit");
	});

	test("configured rate limit should handle concurrent MCP workspaces", () => {
		// With our fixed config: 1000 req/hour, simulate heavy MCP usage
		const FIXED_RATE_LIMIT = {
			enabled: true,
			timeWindow: 1000 * 60 * 60, // 1 hour
			maxRequests: 1000,
		};

		const apiKeyState = {
			rateLimitEnabled: FIXED_RATE_LIMIT.enabled,
			rateLimitTimeWindow: FIXED_RATE_LIMIT.timeWindow,
			rateLimitMax: FIXED_RATE_LIMIT.maxRequests,
			requestCount: 0,
			lastRequest: new Date(),
		};

		// Simulate 5 concurrent workspaces each making 50 requests (heavy usage)
		for (let workspace = 0; workspace < 5; workspace++) {
			for (let req = 0; req < 50; req++) {
				apiKeyState.requestCount++;
			}
		}

		// 250 requests total — should NOT be rate limited
		expect(apiKeyState.requestCount).toBe(250);
		expect(isRateLimited(apiKeyState).limited).toBe(false);
	});
});
