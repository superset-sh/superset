import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * The token endpoint rotates the refresh token on every call. Sending a
 * rotated token again is treated as theft and revokes every token the user
 * holds for the client (GH #8426), unless it comes within the server's reuse
 * grace window (10 minutes, patches/@better-auth%2Foauth-provider). Every
 * process that refreshes the CLI's config.json (the CLI, a host-service)
 * goes through here: one process at a time, under a lock next to the config,
 * and a refresh whose outcome is unknown is retried only inside that window.
 */
export type StoredOAuth = {
	accessToken: string;
	refreshToken?: string;
	expiresAt: number;
	/** Set while a refresh may have reached the server without its result being stored. */
	refreshStartedAt?: number;
};

export type OAuthConfig = { auth?: StoredOAuth };

export type RefreshedConfig<C extends OAuthConfig> = C & { auth: StoredOAuth };

export interface RefreshDeps<C extends OAuthConfig> {
	refresh: (refreshToken: string) => Promise<{
		accessToken: string;
		refreshToken?: string;
		expiresAt: number;
	}>;
	readConfig: () => C | Promise<C>;
	writeConfig: (config: C) => void | Promise<void>;
	lockPath: string;
	/** A lock not touched for this long belongs to a dead process. */
	lockStaleMs: number;
	lockHeartbeatMs: number;
	/** How long to wait for a live holder before giving up on this call. */
	lockTimeoutMs: number;
	pollMs: number;
	/** How long after an unknown outcome the stored token may still be sent. Must stay below the server's grace window. */
	retryWindowMs: number;
	now: () => number;
	sleep: (ms: number) => Promise<void>;
}

/** A token this close to `expiresAt` is treated as expired. */
export const AUTH_REFRESH_LEEWAY_MS = 5 * 60 * 1000;

export function isAuthFresh(auth: StoredOAuth, now: number): boolean {
	return auth.expiresAt - AUTH_REFRESH_LEEWAY_MS > now;
}

export function refreshLockPath(configPath: string): string {
	return join(dirname(configPath), "auth-refresh.lock");
}

export const REFRESH_TIMINGS = {
	lockStaleMs: 5_000,
	lockHeartbeatMs: 1_000,
	lockTimeoutMs: 75_000,
	pollMs: 25,
	retryWindowMs: 5 * 60 * 1000,
} as const;

export class RefreshInProgressError extends Error {
	constructor() {
		super("session refresh still in progress elsewhere");
	}
}

export class SessionExpiredError extends Error {
	constructor() {
		super("session expired");
	}
}

export class ServerUnreachableError extends Error {
	constructor(cause: unknown) {
		super("could not reach the server", { cause });
	}
}

/**
 * Renews the stored OAuth tokens, coordinating with every other process that
 * refreshes the same config. `isRenewed` decides whether the stored tokens
 * can be used as they are; a caller whose access token was just rejected
 * passes one that also requires a different token.
 */
export async function refreshStoredAuth<C extends OAuthConfig>(
	deps: RefreshDeps<C>,
	isRenewed: (auth: StoredOAuth, now: number) => boolean = isAuthFresh,
): Promise<RefreshedConfig<C>> {
	const renewed = (config: C): config is RefreshedConfig<C> =>
		config.auth !== undefined && isRenewed(config.auth, deps.now());

	const lock = await acquireLock(deps);
	try {
		const latest = await deps.readConfig();
		const auth = latest.auth;
		if (renewed(latest)) return latest;
		if (!auth?.refreshToken) throw new SessionExpiredError();
		if (lock.state === "timed-out") throw new RefreshInProgressError();
		const sent = auth.refreshToken;

		// Writes after the token is sent go through here, so a process that
		// does not take the lock (an older CLI, a login) is never overwritten.
		const updateOwnAuth = async (patch: Partial<StoredOAuth>) => {
			const current = await deps.readConfig();
			if (current.auth?.refreshToken !== sent) return current;
			await deps.writeConfig({
				...current,
				auth: { ...current.auth, ...patch },
			});
			return null;
		};
		const dropRefreshToken = async () => {
			const current = await updateOwnAuth({
				refreshToken: undefined,
				refreshStartedAt: undefined,
			});
			if (current && renewed(current)) return current;
			throw new SessionExpiredError();
		};

		const now = deps.now();
		const startedAt = auth.refreshStartedAt ?? now;
		// A marker from the future (a clock moved back, a hand edit) is as
		// unknown as an old one: the server may have rotated long ago.
		if (
			!Number.isFinite(startedAt) ||
			Math.abs(now - startedAt) > deps.retryWindowMs
		) {
			return await dropRefreshToken();
		}
		await deps.writeConfig({
			...latest,
			auth: { ...auth, refreshStartedAt: startedAt },
		});

		// A holder paused long enough to lose its lock must not send: the new
		// holder may already have rotated this token.
		if (!lock.stillHeld()) {
			const current = await deps.readConfig();
			if (renewed(current)) return current;
			throw new RefreshInProgressError();
		}

		let refreshed: Awaited<ReturnType<RefreshDeps<C>["refresh"]>>;
		try {
			refreshed = await deps.refresh(sent);
		} catch (error) {
			const current = await deps.readConfig();
			if (renewed(current)) return current;
			switch (classifyFailure(error)) {
				case "unsent":
					await updateOwnAuth({ refreshStartedAt: auth.refreshStartedAt });
					throw new ServerUnreachableError(error);
				case "rejected":
					return await dropRefreshToken();
				case "unknown":
					throw error;
			}
		}

		const current = await deps.readConfig();
		if (current.auth?.refreshToken !== sent && renewed(current)) return current;
		const next = {
			...current,
			auth: {
				accessToken: refreshed.accessToken,
				refreshToken: refreshed.refreshToken,
				expiresAt: refreshed.expiresAt,
			},
		};
		await deps.writeConfig(next);
		return next;
	} finally {
		lock.release();
	}
}

const UNSENT_ERROR_CODES = new Set([
	"ConnectionRefused",
	"ECONNREFUSED",
	"ENOTFOUND",
	"EAI_AGAIN",
]);

/** `refresh` reports an HTTP failure as an error with a numeric `status`. */
function classifyFailure(error: unknown): "unsent" | "rejected" | "unknown" {
	const { status, code, cause } = error as {
		status?: unknown;
		code?: unknown;
		cause?: { code?: unknown };
	};
	if (typeof status === "number") {
		if (status === 400 || status === 401) return "rejected";
		if (status === 429) return "unsent";
		return "unknown";
	}
	if (
		UNSENT_ERROR_CODES.has(String(code)) ||
		UNSENT_ERROR_CODES.has(String(cause?.code))
	) {
		return "unsent";
	}
	return "unknown";
}

/**
 * Exclusive-create lock file holding an ownership token. The holder touches
 * it every `lockHeartbeatMs`, so a lock left untouched for `lockStaleMs`
 * belongs to a dead process however long a live refresh takes. Release and
 * takeover check the token, so a lock that changed hands is never removed.
 */
type AcquiredLock = {
	/** "unlockable": the filesystem refuses locks, so no process can hold one. */
	state: "held" | "unlockable" | "timed-out";
	stillHeld: () => boolean;
	release: () => void;
};

/**
 * The lock lives next to the config. When that directory is not writable
 * (a read-only home with config.json linked elsewhere), every process falls
 * back to the same lock in the temp directory instead of running unlocked.
 */
function usableLockPath(preferred: string): string {
	try {
		fs.accessSync(dirname(preferred), fs.constants.W_OK | fs.constants.X_OK);
		return preferred;
	} catch {
		const key = createHash("sha256").update(preferred).digest("hex");
		return join(tmpdir(), `superset-auth-refresh-${key.slice(0, 16)}.lock`);
	}
}

async function acquireLock<C extends OAuthConfig>(
	deps: RefreshDeps<C>,
): Promise<AcquiredLock> {
	const lockPath = usableLockPath(deps.lockPath);
	const token = `${process.pid} ${randomUUID()}`;
	const deadline = deps.now() + deps.lockTimeoutMs;
	const ownsLock = () => {
		try {
			return fs.readFileSync(lockPath, "utf-8") === token;
		} catch {
			return false;
		}
	};
	for (;;) {
		try {
			const fd = fs.openSync(lockPath, "wx");
			fs.writeSync(fd, token);
			fs.closeSync(fd);
			const heartbeat = setInterval(() => {
				if (!ownsLock()) return;
				try {
					const now = new Date();
					fs.utimesSync(lockPath, now, now);
				} catch {}
			}, deps.lockHeartbeatMs);
			heartbeat.unref?.();
			return {
				state: "held",
				stillHeld: ownsLock,
				release: () => {
					clearInterval(heartbeat);
					try {
						if (ownsLock()) fs.unlinkSync(lockPath);
					} catch {}
				},
			};
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
				return {
					state: "unlockable",
					stillHeld: () => true,
					release: () => {},
				};
			}
		}
		if (deps.now() >= deadline) {
			return { state: "timed-out", stillHeld: () => false, release: () => {} };
		}
		try {
			const observed = fs.readFileSync(lockPath, "utf-8");
			const age = Date.now() - fs.statSync(lockPath).mtimeMs;
			if (age > deps.lockStaleMs) {
				const corpse = `${lockPath}.${randomUUID()}.stale`;
				fs.renameSync(lockPath, corpse);
				if (fs.readFileSync(corpse, "utf-8") === observed) {
					fs.unlinkSync(corpse);
					continue;
				}
				// Changed hands between the read and the rename: give it back.
				// A hard link cannot replace a lock created at the path since.
				try {
					fs.linkSync(corpse, lockPath);
				} catch {}
				try {
					fs.unlinkSync(corpse);
				} catch {}
			}
		} catch {}
		await deps.sleep(deps.pollMs);
	}
}
