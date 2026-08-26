import {
	afterAll,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const testSupersetHomeDir = fs.mkdtempSync(
	path.join(os.tmpdir(), "auth-functions-test-"),
);
process.env.SUPERSET_HOME_DIR = testSupersetHomeDir;
const tokenFile = path.join(testSupersetHomeDir, "auth-token.enc");

// Keep this unit test independent from suite-global host-info mocks. The
// persistence behavior under test only needs a reversible storage boundary.
mock.module("./crypto-storage", () => ({
	encrypt: (plaintext: string) => Buffer.from(plaintext),
	decrypt: (data: Buffer) => data.toString("utf8"),
}));

const {
	authEvents,
	clearToken,
	handleAuthCallback,
	loadToken,
	parseAuthDeepLink,
	saveOrganizationIds,
	saveToken,
	stateStore,
} = await import("./auth-functions");
const { PROTOCOL_SCHEME } = await import("shared/constants");

/** Quarantining logs a warning by design; keep test output readable. */
async function quietly<Result>(run: () => Promise<Result>): Promise<Result> {
	const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
	try {
		return await run();
	} finally {
		warnSpy.mockRestore();
	}
}

function quarantinedTokenPaths(): string[] {
	const prefix = `${path.basename(tokenFile)}.corrupt-`;
	return fs
		.readdirSync(testSupersetHomeDir)
		.filter((name) => name.startsWith(prefix))
		.map((name) => path.join(testSupersetHomeDir, name));
}

beforeEach(() => {
	process.env.SUPERSET_HOME_DIR = testSupersetHomeDir;
	for (const entry of fs.readdirSync(testSupersetHomeDir)) {
		fs.rmSync(path.join(testSupersetHomeDir, entry), {
			recursive: true,
			force: true,
		});
	}
	stateStore.clear();
});

afterAll(() => {
	fs.rmSync(testSupersetHomeDir, { recursive: true, force: true });
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
});

describe("auth token storage", () => {
	test("atomically stores credentials only in the test Superset home", async () => {
		await saveToken({ token: "token", expiresAt: "2099-01-01" });

		expect(fs.statSync(tokenFile).isFile()).toBe(true);
		expect(fs.statSync(tokenFile).mode & 0o777).toBe(0o600);
		expect(
			fs.readdirSync(testSupersetHomeDir).some((name) => name.endsWith(".tmp")),
		).toBe(false);
		expect(await loadToken()).toEqual({
			token: "token",
			expiresAt: "2099-01-01",
			organizationIds: null,
			organizationIdsRevision: 0,
		});
	});

	test("reports a missing token without logging a failure", async () => {
		// loadToken swallows everything it throws, so an internal crash would
		// otherwise be indistinguishable from "no token stored".
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});

		try {
			expect(await loadToken()).toEqual({
				token: null,
				expiresAt: null,
				organizationIds: null,
				organizationIdsRevision: 0,
			});
			expect(errorSpy).not.toHaveBeenCalled();
		} finally {
			errorSpy.mockRestore();
		}
	});

	test("quarantines a directory and preserves its contents before saving", async () => {
		fs.mkdirSync(tokenFile);
		fs.writeFileSync(path.join(tokenFile, "keep-me"), "important");

		await quietly(() => saveToken({ token: "token", expiresAt: "2099-01-01" }));

		expect(fs.statSync(tokenFile).isFile()).toBe(true);
		const [quarantinedPath] = quarantinedTokenPaths();
		expect(fs.statSync(quarantinedPath).isDirectory()).toBe(true);
		expect(fs.readFileSync(path.join(quarantinedPath, "keep-me"), "utf8")).toBe(
			"important",
		);
	});

	test("quarantines corrupt token contents during load", async () => {
		fs.writeFileSync(tokenFile, "not valid auth JSON");

		const loadedToken = await quietly(() => loadToken());

		expect(loadedToken).toEqual({
			token: null,
			expiresAt: null,
			organizationIds: null,
			organizationIdsRevision: 0,
		});
		expect(fs.existsSync(tokenFile)).toBe(false);
		const [quarantinedPath] = quarantinedTokenPaths();
		expect(fs.readFileSync(quarantinedPath, "utf8")).toBe(
			"not valid auth JSON",
		);
	});

	test("quarantines a symlink without modifying its target", async () => {
		const targetFile = path.join(testSupersetHomeDir, "target-file");
		fs.writeFileSync(targetFile, "do not touch");
		fs.symlinkSync(targetFile, tokenFile);

		await quietly(() => saveToken({ token: "token", expiresAt: "2099-01-01" }));

		expect(fs.readFileSync(targetFile, "utf8")).toBe("do not touch");
		expect(fs.statSync(tokenFile).isFile()).toBe(true);
		const [quarantinedPath] = quarantinedTokenPaths();
		expect(fs.lstatSync(quarantinedPath).isSymbolicLink()).toBe(true);
	});

	test("keeps auth state retryable when durable storage fails", async () => {
		const state = "pending-state";
		stateStore.set(state, Date.now());
		const blockedHome = path.join(testSupersetHomeDir, "blocked-home");
		fs.writeFileSync(blockedHome, "not a directory");
		process.env.SUPERSET_HOME_DIR = blockedHome;
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});

		try {
			const failedResult = await handleAuthCallback({
				token: "token",
				expiresAt: "2099-01-01",
				state,
			});

			expect(failedResult.success).toBe(false);
			expect(stateStore.has(state)).toBe(true);
		} finally {
			errorSpy.mockRestore();
			process.env.SUPERSET_HOME_DIR = testSupersetHomeDir;
		}

		fs.unlinkSync(blockedHome);
		const retriedResult = await handleAuthCallback({
			token: "token",
			expiresAt: "2099-01-01",
			state,
		});

		expect(retriedResult).toEqual({ success: true });
		expect(stateStore.has(state)).toBe(false);
	});

	test("sign-out clears unusable storage from the token path before reporting success", async () => {
		fs.writeFileSync(tokenFile, "corrupt credentials");
		const tokenCleared = mock(() => {});
		authEvents.once("token-cleared", tokenCleared);

		try {
			await quietly(() => clearToken());
		} finally {
			authEvents.off("token-cleared", tokenCleared);
		}

		expect(fs.existsSync(tokenFile)).toBe(false);
		expect(fs.readFileSync(quarantinedTokenPaths()[0], "utf8")).toBe(
			"corrupt credentials",
		);
		expect(tokenCleared).toHaveBeenCalledTimes(1);
	});

	test("does not report sign-out when the credential cannot be cleared", async () => {
		const readOnlyHome = path.join(testSupersetHomeDir, "read-only-home");
		fs.mkdirSync(readOnlyHome);
		fs.writeFileSync(path.join(readOnlyHome, "auth-token.enc"), "corrupt");
		fs.chmodSync(readOnlyHome, 0o500);
		process.env.SUPERSET_HOME_DIR = readOnlyHome;
		const tokenCleared = mock(() => {});
		authEvents.once("token-cleared", tokenCleared);

		try {
			await expect(clearToken()).rejects.toThrow();
			expect(tokenCleared).not.toHaveBeenCalled();
		} finally {
			authEvents.off("token-cleared", tokenCleared);
			process.env.SUPERSET_HOME_DIR = testSupersetHomeDir;
			fs.chmodSync(readOnlyHome, 0o700);
		}
	});

	test("does not report a saved token when the write lock never frees up", async () => {
		// A lock entry with a fresh mtime never looks stale, so acquisition runs
		// out of retries. Giving up on the lock must stay a failure the caller
		// sees: a token that was never written must never look written.
		const lockEntry = `${tokenFile}.lock`;
		fs.mkdirSync(lockEntry);
		const tokenSaved = mock(() => {});
		authEvents.once("token-saved", tokenSaved);

		try {
			await expect(
				saveToken({ token: "token", expiresAt: "2099-01-01" }),
			).rejects.toThrow();
			expect(tokenSaved).not.toHaveBeenCalled();
			expect(fs.existsSync(tokenFile)).toBe(false);
		} finally {
			authEvents.off("token-saved", tokenSaved);
			fs.rmdirSync(lockEntry);
		}
	});

	test("survives another writer reclaiming the write lock mid-write", async () => {
		// proper-lockfile keeps the entry it handed us fresh on a timer (stale / 2,
		// so five seconds out) and calls onCompromised once that refresh finds the
		// entry gone. Its default handler rethrows from inside the timer, where no
		// caller can catch it. Run the library's own refresh as soon as the entry
		// is gone rather than waiting five seconds for it: everything that detects
		// and reports the loss is the real thing, only the delay is skipped.
		const lockEntry = `${tokenFile}.lock`;
		const realSetTimeout = globalThis.setTimeout;
		let refreshRan = false;
		globalThis.setTimeout = ((
			handler: () => void,
			delay?: number,
			...args: unknown[]
		) => {
			if (typeof delay !== "number" || delay < 1_000) {
				return realSetTimeout(handler, delay, ...args);
			}
			// The lock refresh, armed the moment the write took the lock. Take the
			// entry away the way a second desktop process reclaiming it would.
			globalThis.setTimeout = realSetTimeout;
			refreshRan = true;
			fs.rmdirSync(lockEntry);
			handler();
			// The refresh has already run; hand the library a timer it can unref
			// and clear like the one it asked for.
			return realSetTimeout(() => undefined, 0);
		}) as typeof globalThis.setTimeout;
		let recordedLosses = 0;
		let recordLoss: () => void = () => undefined;
		const lossRecorded = new Promise<void>((resolve) => {
			recordLoss = resolve;
		});
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {
			recordedLosses += 1;
			recordLoss();
		});

		try {
			// Rethrowing from the refresh would fail this test outright, and a
			// release that overrode the operation's result would reject here.
			await saveToken({ token: "token", expiresAt: "2099-01-01" });
			// The library reports the loss from its own stat callback, which can
			// land after the write resolves. Wait for it rather than racing it:
			// a count read straight after the write would pass or fail on
			// scheduling. If the loss is never reported this hangs to the test
			// timeout, which is the failure we want.
			await lossRecorded;
		} finally {
			globalThis.setTimeout = realSetTimeout;
			warnSpy.mockRestore();
		}

		expect(refreshRan).toBe(true);
		expect(recordedLosses).toBeGreaterThan(0);
		// Losing the lock says nothing about whether the write landed, so it must
		// never stand in for the operation's own result. This one landed.
		expect(await loadToken()).toEqual({
			token: "token",
			expiresAt: "2099-01-01",
			organizationIds: null,
			organizationIdsRevision: 0,
		});
	});
});

describe("cached organization membership", () => {
	test("stores a normalized membership set alongside the encrypted token", async () => {
		await saveToken({ token: "token", expiresAt: "2099-01-01" });
		const membershipSaved = mock(() => {});
		authEvents.once("organization-ids-saved", membershipSaved);

		await saveOrganizationIds({
			token: "token",
			organizationIds: ["org-2", "org-1", "org-2"],
			expectedRevision: 0,
		});

		expect(await loadToken()).toEqual({
			token: "token",
			expiresAt: "2099-01-01",
			organizationIds: ["org-1", "org-2"],
			organizationIdsRevision: 1,
		});
		expect(membershipSaved).toHaveBeenCalledWith({
			token: "token",
			organizationIds: ["org-1", "org-2"],
		});
	});

	test("confirms unchanged membership for the current app process", async () => {
		await saveToken({ token: "token", expiresAt: "2099-01-01" });
		await saveOrganizationIds({
			token: "token",
			organizationIds: ["org-1", "org-2"],
			expectedRevision: 0,
		});
		const membershipSaved = mock(() => {});
		authEvents.once("organization-ids-saved", membershipSaved);

		await saveOrganizationIds({
			token: "token",
			organizationIds: ["org-2", "org-1"],
			expectedRevision: 1,
		});

		expect(membershipSaved).toHaveBeenCalledWith({
			token: "token",
			organizationIds: ["org-1", "org-2"],
		});
	});

	test("clears cached membership when a different token is saved", async () => {
		await saveToken({ token: "old-token", expiresAt: "2099-01-01" });
		await saveOrganizationIds({
			token: "old-token",
			organizationIds: ["old-org"],
			expectedRevision: 0,
		});

		await saveToken({ token: "new-token", expiresAt: "2099-02-01" });

		expect(await loadToken()).toEqual({
			token: "new-token",
			expiresAt: "2099-02-01",
			organizationIds: null,
			organizationIdsRevision: 0,
		});
	});

	test("ignores membership from a stale account session", async () => {
		await saveToken({ token: "new-token", expiresAt: "2099-02-01" });

		await saveOrganizationIds({
			token: "old-token",
			organizationIds: ["old-org"],
			expectedRevision: 0,
		});

		expect(await loadToken()).toEqual({
			token: "new-token",
			expiresAt: "2099-02-01",
			organizationIds: null,
			organizationIdsRevision: 0,
		});
	});

	test("does not let stale membership recreate auth after sign-out", async () => {
		await saveToken({ token: "old-token", expiresAt: "2099-01-01" });
		await clearToken();

		await saveOrganizationIds({
			token: "old-token",
			organizationIds: ["old-org"],
			expectedRevision: 0,
		});

		expect(await loadToken()).toEqual({
			token: null,
			expiresAt: null,
			organizationIds: null,
			organizationIdsRevision: 0,
		});
	});

	test("ignores a delayed retry from an older membership snapshot", async () => {
		await saveToken({ token: "token", expiresAt: "2099-01-01" });
		await saveOrganizationIds({
			token: "token",
			organizationIds: ["current-org"],
			expectedRevision: 0,
		});

		const result = await saveOrganizationIds({
			token: "token",
			organizationIds: ["removed-org"],
			expectedRevision: 0,
		});

		expect(result).toEqual({ status: "conflict", revision: 1 });
		expect(await loadToken()).toEqual({
			token: "token",
			expiresAt: "2099-01-01",
			organizationIds: ["current-org"],
			organizationIdsRevision: 1,
		});
	});

	test("never attaches membership to unusable storage", async () => {
		fs.mkdirSync(tokenFile);

		const result = await quietly(() =>
			saveOrganizationIds({
				token: "token",
				organizationIds: ["org-1"],
				expectedRevision: 0,
			}),
		);

		expect(result).toEqual({ status: "token-mismatch", revision: 0 });
		expect(quarantinedTokenPaths()).toHaveLength(1);
		expect(fs.existsSync(tokenFile)).toBe(false);
	});
});

describe("parseAuthDeepLink", () => {
	test("flags incomplete auth callbacks as malformed, not non-auth", () => {
		expect(
			parseAuthDeepLink(`${PROTOCOL_SCHEME}://auth/callback?token=secret`),
		).toEqual({ type: "malformed" });
	});

	test("classifies non-auth links and complete callbacks", () => {
		expect(parseAuthDeepLink(`${PROTOCOL_SCHEME}://tasks/my-slug`)).toEqual({
			type: "not-auth",
		});
		expect(
			parseAuthDeepLink(
				`${PROTOCOL_SCHEME}://auth/callback?token=t&expiresAt=2099-01-01&state=s`,
			),
		).toEqual({
			type: "valid",
			params: { token: "t", expiresAt: "2099-01-01", state: "s" },
		});
	});
});
