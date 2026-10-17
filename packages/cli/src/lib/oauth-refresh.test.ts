import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SupersetConfig } from "./config";
import {
	isAuthFresh,
	type RefreshDeps,
	refreshStoredAuth,
} from "./oauth-refresh";

/**
 * The token endpoint rotates the refresh token on every call and treats a
 * reuse of the rotated one as theft, revoking the whole family (GH #8426).
 * These tests pin the client-side contract that prevents that: across
 * concurrent callers, the stale refresh token is sent to the server at most
 * once, and callers that lose the race ride on the winner's new token.
 */
function makeHarness(initialAuth: SupersetConfig["auth"]) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oauth-refresh-"));
	let stored: SupersetConfig = { auth: initialAuth };
	let refreshCalls = 0;
	let sleepCalls = 0;
	const deps: RefreshDeps = {
		refresh: async () => {
			refreshCalls += 1;
			await new Promise((resolve) => setTimeout(resolve, 20));
			return {
				accessToken: `fresh-${refreshCalls}`,
				refreshToken: `rotated-${refreshCalls}`,
				expiresAt: Date.now() + 60 * 60 * 1000,
			};
		},
		readConfig: () => structuredClone(stored),
		writeConfig: (config) => {
			stored = structuredClone(config);
		},
		lockPath: path.join(dir, "auth-refresh.lock"),
		lockStaleMs: 1000,
		lockTimeoutMs: 500,
		pollMs: 5,
		now: () => Date.now(),
		sleep: (ms) => {
			sleepCalls += 1;
			return new Promise((resolve) => setTimeout(resolve, ms));
		},
	};
	return {
		deps,
		dir,
		get stored() {
			return stored;
		},
		get refreshCalls() {
			return refreshCalls;
		},
		get sleepCalls() {
			return sleepCalls;
		},
		cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
	};
}

const staleAuth = () => ({
	accessToken: "stale",
	refreshToken: "stale-refresh",
	expiresAt: Date.now() - 1000,
});

describe("refreshStoredAuth", () => {
	it("sends the stale refresh token to the server at most once across concurrent callers", async () => {
		const h = makeHarness(staleAuth());
		try {
			const results = await Promise.all([
				refreshStoredAuth(h.deps),
				refreshStoredAuth(h.deps),
				refreshStoredAuth(h.deps),
			]);
			expect(h.refreshCalls).toBe(1);
			for (const result of results) {
				expect(result.auth?.accessToken).toBe("fresh-1");
				expect(result.auth?.refreshToken).toBe("rotated-1");
			}
			expect(h.stored.auth?.accessToken).toBe("fresh-1");
		} finally {
			h.cleanup();
		}
	});

	it("returns without a network call when another process already renewed", async () => {
		const fresh = {
			accessToken: "already-fresh",
			refreshToken: "kept",
			expiresAt: Date.now() + 60 * 60 * 1000,
		};
		const h = makeHarness(fresh);
		try {
			const result = await refreshStoredAuth(h.deps);
			expect(h.refreshCalls).toBe(0);
			expect(result.auth?.accessToken).toBe("already-fresh");
		} finally {
			h.cleanup();
		}
	});

	it("falls back to a token another writer stored when its own refresh fails", async () => {
		const h = makeHarness(staleAuth());
		h.deps.refresh = async () => {
			// Simulate losing the race to a writer this process cannot see
			// through the lock (a non-CLI writer, or a lock takeover).
			h.deps.writeConfig({
				auth: {
					accessToken: "their-token",
					refreshToken: "their-refresh",
					expiresAt: Date.now() + 60 * 60 * 1000,
				},
			});
			throw new Error("invalid_grant");
		};
		try {
			const result = await refreshStoredAuth(h.deps);
			expect(result.auth?.accessToken).toBe("their-token");
		} finally {
			h.cleanup();
		}
	});

	it("still reports an expired session when the refresh fails and nothing fresh appears", async () => {
		const h = makeHarness(staleAuth());
		h.deps.refresh = async () => {
			throw new Error("invalid_grant");
		};
		try {
			await expect(refreshStoredAuth(h.deps)).rejects.toThrow();
		} finally {
			h.cleanup();
		}
	});

	it("takes over a lock left behind by a dead process", async () => {
		const h = makeHarness(staleAuth());
		try {
			fs.writeFileSync(h.deps.lockPath, "9999999");
			const old = new Date(Date.now() - 10_000);
			fs.utimesSync(h.deps.lockPath, old, old);
			const result = await refreshStoredAuth(h.deps);
			expect(h.refreshCalls).toBe(1);
			expect(result.auth?.accessToken).toBe("fresh-1");
		} finally {
			h.cleanup();
		}
	});

	it("does not remove a lock that was taken over while it was refreshing", async () => {
		const h = makeHarness(staleAuth());
		h.deps.refresh = async () => {
			// A takeover happens mid-refresh: someone replaces the lock.
			fs.writeFileSync(h.deps.lockPath, "intruder");
			return {
				accessToken: "fresh-1",
				refreshToken: "rotated-1",
				expiresAt: Date.now() + 60 * 60 * 1000,
			};
		};
		try {
			await refreshStoredAuth(h.deps);
			// Release must leave the new holder's lock alone.
			expect(fs.readFileSync(h.deps.lockPath, "utf-8")).toBe("intruder");
		} finally {
			h.cleanup();
		}
	});

	it("refuses to spend the stored token beside a live holder that outlasts the wait", async () => {
		const h = makeHarness(staleAuth());
		// A live foreign lock that never goes stale within this test.
		fs.writeFileSync(h.deps.lockPath, "wedged-holder");
		h.deps.lockStaleMs = 10_000;
		h.deps.lockTimeoutMs = 40;
		h.deps.pollMs = 5;
		try {
			await expect(refreshStoredAuth(h.deps)).rejects.toThrow(/in progress/);
			expect(h.refreshCalls).toBe(0);
			expect(h.sleepCalls).toBeGreaterThan(0);
			// The stored refresh token survives for whoever holds the lock.
			expect(h.stored.auth?.refreshToken).toBe("stale-refresh");
			// The foreign lock was neither stolen nor removed.
			expect(fs.readFileSync(h.deps.lockPath, "utf-8")).toBe("wedged-holder");
		} finally {
			h.cleanup();
		}
	});

	it("consumes the refresh token from disk before spending it", async () => {
		const h = makeHarness(staleAuth());
		const realRefresh = h.deps.refresh;
		let tokenOnDiskDuringRefresh: string | undefined = "unread";
		h.deps.refresh = async (refreshToken) => {
			tokenOnDiskDuringRefresh = h.stored.auth?.refreshToken;
			return realRefresh(refreshToken);
		};
		try {
			const result = await refreshStoredAuth(h.deps);
			// A crash mid-refresh must leave nothing replayable on disk.
			expect(tokenOnDiskDuringRefresh).toBeUndefined();
			expect(result.auth?.refreshToken).toBe("rotated-1");
			expect(h.stored.auth?.refreshToken).toBe("rotated-1");
		} finally {
			h.cleanup();
		}
	});

	it("a failed refresh burns the token, so no later caller can replay it", async () => {
		const h = makeHarness(staleAuth());
		h.deps.refresh = async () => {
			throw new Error("network down");
		};
		try {
			await expect(refreshStoredAuth(h.deps)).rejects.toThrow(/network down/);
			// An ambiguous failure may have rotated server-side; a replay of
			// the old token would read as theft and revoke every machine.
			// The second caller must not touch the network at all.
			await expect(refreshStoredAuth(h.deps)).rejects.toThrow(
				/session expired/,
			);
			expect(h.refreshCalls).toBe(0);
			expect(h.sleepCalls).toBe(0);
		} finally {
			h.cleanup();
		}
	});
});

describe("isAuthFresh", () => {
	it("treats a token inside the refresh leeway as expired", () => {
		const now = Date.now();
		expect(isAuthFresh({ accessToken: "a", expiresAt: now + 1000 }, now)).toBe(
			false,
		);
		expect(
			isAuthFresh({ accessToken: "a", expiresAt: now + 10 * 60 * 1000 }, now),
		).toBe(true);
	});
});
