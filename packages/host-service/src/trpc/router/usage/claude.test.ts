import { describe, expect, it } from "bun:test";
import { classifyLapsedToken } from "./claude";

const now = Date.parse("2026-09-04T14:00:00Z");
const hour = 60 * 60 * 1000;

describe("classifyLapsedToken", () => {
	it("is live while the access token has not expired", () => {
		expect(
			classifyLapsedToken(
				{ expiresAt: now + hour, refreshTokenExpiresAt: null },
				now,
			),
		).toBe("live");
		expect(
			classifyLapsedToken(
				{ expiresAt: null, refreshTokenExpiresAt: null },
				now,
			),
		).toBe("live");
	});

	it("is stale, not expired, when only the access token has lapsed", () => {
		expect(
			classifyLapsedToken(
				{ expiresAt: now - 7 * hour, refreshTokenExpiresAt: now + 24 * hour },
				now,
			),
		).toBe("token_stale");
	});

	it("is expired once the refresh token has lapsed or is missing", () => {
		expect(
			classifyLapsedToken(
				{ expiresAt: now - hour, refreshTokenExpiresAt: now - 1 },
				now,
			),
		).toBe("token_expired");
		expect(
			classifyLapsedToken(
				{ expiresAt: now - hour, refreshTokenExpiresAt: null },
				now,
			),
		).toBe("token_expired");
	});
});
