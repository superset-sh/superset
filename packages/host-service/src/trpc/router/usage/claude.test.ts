import { describe, expect, it } from "bun:test";
import type { ClaudeOauthCredential } from "./claude";
import { classifyLapsedToken, pickFreshest } from "./claude";

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

function credential(
	overrides: Partial<ClaudeOauthCredential> & { accessToken: string },
): ClaudeOauthCredential {
	return {
		expiresAt: null,
		refreshTokenExpiresAt: null,
		subscriptionType: null,
		accountKey: overrides.accessToken,
		sourceLabel: "test",
		selection: null,
		...overrides,
	};
}

describe("pickFreshest", () => {
	it("prefers a renewable copy over one whose refresh token lapsed", () => {
		const renewable = credential({
			accessToken: "renewable",
			expiresAt: now - 10 * hour,
			refreshTokenExpiresAt: now + 24 * hour,
		});
		const deadButLater = credential({
			accessToken: "dead",
			expiresAt: now - hour,
			refreshTokenExpiresAt: now - hour,
		});
		expect(pickFreshest([deadButLater, renewable], now)).toBe(renewable);
		expect(pickFreshest([renewable, deadButLater], now)).toBe(renewable);
	});

	it("prefers a live copy over a stale one and the latest expiry among equals", () => {
		const live = credential({ accessToken: "live", expiresAt: now + hour });
		const stale = credential({
			accessToken: "stale",
			expiresAt: now - hour,
			refreshTokenExpiresAt: now + 24 * hour,
		});
		const later = credential({
			accessToken: "later",
			expiresAt: now + 2 * hour,
		});
		expect(pickFreshest([stale, live], now)).toBe(live);
		expect(pickFreshest([live, later, null], now)).toBe(later);
	});
});
