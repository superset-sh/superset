import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	isAuthFresh,
	type OAuthConfig,
	type RefreshDeps,
	RefreshInProgressError,
	refreshStoredAuth,
	ServerUnreachableError,
	SessionExpiredError,
} from "./oauth-refresh";

type SupersetConfig = OAuthConfig & { organizationId?: string };

const httpError = (status: number) =>
	Object.assign(new Error(`Token refresh failed: ${status}`), { status });

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
	const deps: RefreshDeps<SupersetConfig> = {
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
		lockHeartbeatMs: 10,
		lockTimeoutMs: 500,
		pollMs: 5,
		retryWindowMs: 60_000,
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

	it("keeps the token on disk while the refresh is in flight, marked as started", async () => {
		const h = makeHarness(staleAuth());
		let onDisk: SupersetConfig["auth"];
		h.deps.refresh = async () => {
			onDisk = h.stored.auth;
			throw new Error("killed");
		};
		try {
			await expect(refreshStoredAuth(h.deps)).rejects.toThrow(/killed/);
			expect(onDisk?.refreshToken).toBe("stale-refresh");
			expect(onDisk?.refreshStartedAt).toBeNumber();
			expect(h.stored.auth?.refreshStartedAt).toBe(onDisk?.refreshStartedAt);
		} finally {
			h.cleanup();
		}
	});

	it("retries a refresh with an unknown outcome inside the retry window", async () => {
		const h = makeHarness(staleAuth());
		const realRefresh = h.deps.refresh;
		h.deps.refresh = async () => {
			throw httpError(500);
		};
		try {
			await expect(refreshStoredAuth(h.deps)).rejects.toThrow(/500/);
			h.deps.refresh = realRefresh;
			const result = await refreshStoredAuth(h.deps);
			expect(result.auth?.accessToken).toBe("fresh-1");
			expect(h.stored.auth?.refreshStartedAt).toBeUndefined();
		} finally {
			h.cleanup();
		}
	});

	it("drops the token instead of sending it once an unknown outcome is older than the retry window", async () => {
		const h = makeHarness({
			...staleAuth(),
			refreshStartedAt: Date.now() - 61_000,
		});
		try {
			await expect(refreshStoredAuth(h.deps)).rejects.toBeInstanceOf(
				SessionExpiredError,
			);
			expect(h.refreshCalls).toBe(0);
			expect(h.stored.auth?.refreshToken).toBeUndefined();
		} finally {
			h.cleanup();
		}
	});

	it("drops the token instead of sending it when the marker is from the future", async () => {
		const h = makeHarness({
			...staleAuth(),
			refreshStartedAt: Date.now() + 61_000,
		});
		try {
			await expect(refreshStoredAuth(h.deps)).rejects.toBeInstanceOf(
				SessionExpiredError,
			);
			expect(h.refreshCalls).toBe(0);
			expect(h.stored.auth?.refreshToken).toBeUndefined();
		} finally {
			h.cleanup();
		}
	});

	it("does not send after another process took the lock while it was paused", async () => {
		const h = makeHarness(staleAuth());
		const writeConfig = h.deps.writeConfig;
		h.deps.writeConfig = (config) => {
			writeConfig(config);
			if (config.auth?.refreshStartedAt) {
				fs.writeFileSync(h.deps.lockPath, "new-holder");
			}
		};
		try {
			await expect(refreshStoredAuth(h.deps)).rejects.toBeInstanceOf(
				RefreshInProgressError,
			);
			expect(h.refreshCalls).toBe(0);
		} finally {
			h.cleanup();
		}
	});

	it("still serializes callers when the config directory is not writable", async () => {
		const h = makeHarness(staleAuth());
		const readOnly = path.join(h.dir, "read-only");
		fs.mkdirSync(readOnly);
		fs.chmodSync(readOnly, 0o500);
		h.deps.lockPath = path.join(readOnly, "auth-refresh.lock");
		try {
			await Promise.all([refreshStoredAuth(h.deps), refreshStoredAuth(h.deps)]);
			expect(h.refreshCalls).toBe(1);
		} finally {
			fs.chmodSync(readOnly, 0o700);
			h.cleanup();
		}
	});

	it("drops the token when the server rejects it", async () => {
		const h = makeHarness(staleAuth());
		h.deps.refresh = async () => {
			throw httpError(400);
		};
		try {
			await expect(refreshStoredAuth(h.deps)).rejects.toBeInstanceOf(
				SessionExpiredError,
			);
			expect(h.stored.auth?.refreshToken).toBeUndefined();
		} finally {
			h.cleanup();
		}
	});

	it("does not overwrite tokens another refresher stored after its own refresh was rejected", async () => {
		const h = makeHarness(staleAuth());
		h.deps.refresh = async () => {
			h.deps.writeConfig({
				auth: {
					accessToken: "other-access",
					refreshToken: "other-refresh",
					expiresAt: Date.now() - 1000,
				},
			});
			throw httpError(400);
		};
		try {
			await expect(refreshStoredAuth(h.deps)).rejects.toBeInstanceOf(
				SessionExpiredError,
			);
			expect(h.stored.auth?.refreshToken).toBe("other-refresh");
		} finally {
			h.cleanup();
		}
	});

	it("keeps a login that was stored while the refresh was in flight", async () => {
		const h = makeHarness(staleAuth());
		const realRefresh = h.deps.refresh;
		h.deps.refresh = async (token) => {
			h.deps.writeConfig({
				auth: {
					accessToken: "login-access",
					refreshToken: "login-refresh",
					expiresAt: Date.now() + 60 * 60 * 1000,
				},
				organizationId: "org-from-login",
			});
			return realRefresh(token);
		};
		try {
			const result = await refreshStoredAuth(h.deps);
			expect(result.auth?.refreshToken).toBe("login-refresh");
			expect(h.stored.organizationId).toBe("org-from-login");
		} finally {
			h.cleanup();
		}
	});

	it("a holder slower than the stale threshold keeps its lock by heartbeat", async () => {
		const h = makeHarness(staleAuth());
		h.deps.lockStaleMs = 40;
		const realRefresh = h.deps.refresh;
		h.deps.refresh = async (token) => {
			await new Promise((resolve) => setTimeout(resolve, 150));
			return realRefresh(token);
		};
		try {
			await Promise.all([refreshStoredAuth(h.deps), refreshStoredAuth(h.deps)]);
			expect(h.refreshCalls).toBe(1);
		} finally {
			h.cleanup();
		}
	});

	it("keeps the token when the request never left this machine", async () => {
		const h = makeHarness(staleAuth());
		h.deps.refresh = async () => {
			throw Object.assign(new Error("Unable to connect"), {
				code: "ConnectionRefused",
			});
		};
		try {
			await expect(refreshStoredAuth(h.deps)).rejects.toBeInstanceOf(
				ServerUnreachableError,
			);
			expect(h.stored.auth?.refreshToken).toBe("stale-refresh");
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
