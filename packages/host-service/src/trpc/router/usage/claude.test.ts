import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClaudeOauthCredential } from "./claude";
import {
	classifyLapsedToken,
	dedupeClaudeCredentials,
	discoverClaudeQuotaTargets,
	fetchClaudeAccountForSelection,
	pickFreshest,
	readCredentialForConfigDir,
} from "./claude";
import {
	activeClaudeConfigDirPath,
	setIdentityBindingRecorder,
} from "./default-account";

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
		accountId: null,
		managed: true,
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

/**
 * KTD4: identity, not the access token, is what makes two logins one account.
 * Right after a swap the active dir and the owner profile hold the same
 * token, and an API-key login has no account id to key on at all.
 */
describe("dedupeClaudeCredentials", () => {
	it("keeps two accounts that share one access token", () => {
		const first = credential({
			accessToken: "shared",
			accountId: "uuid-a",
			selection: "/home/u/.claude-a",
		});
		const second = credential({
			accessToken: "shared",
			accountId: "uuid-b",
			selection: "/home/u/.claude-b",
		});

		expect(
			dedupeClaudeCredentials([first, second]).map((one) => one.accountId),
		).toEqual(["uuid-a", "uuid-b"]);
	});

	it("collapses one identity found in two dirs, keeping the freshest", () => {
		// The walk always probes the system default before the sorted profile
		// dirs, so keeping whichever it saw first let a lapsed ~/.claude
		// shadow a live profile dir holding the same account.
		const fromDefault = credential({
			accessToken: "one",
			accountId: "uuid-a",
			selection: null,
			expiresAt: now + hour,
			refreshTokenExpiresAt: now + hour,
		});
		const fromProfile = credential({
			accessToken: "two",
			accountId: "uuid-a",
			selection: "/home/u/.claude-a",
			expiresAt: now + 10 * hour,
			refreshTokenExpiresAt: now + 10 * hour,
		});

		expect(
			dedupeClaudeCredentials([fromDefault, fromProfile], now).map(
				(one) => one.accessToken,
			),
		).toEqual(["two"]);
	});

	// One login in two dirs is one account but two run targets. When one is
	// signed out and the other is not they are not interchangeable, and
	// collapsing them hides either the truthful expired card or the working
	// one — so both are listed and the user can move between them.
	it("keeps both copies when one is live and the other has lapsed", () => {
		const lapsed = credential({
			accessToken: "stale",
			accountId: "uuid-a",
			selection: null,
			expiresAt: now - 10 * hour,
			refreshTokenExpiresAt: now - hour,
		});
		const live = credential({
			accessToken: "live",
			accountId: "uuid-a",
			selection: "/home/u/.claude-a",
			expiresAt: now + hour,
			refreshTokenExpiresAt: now + 10 * hour,
		});

		expect(
			dedupeClaudeCredentials([lapsed, live], now).map(
				(one) => one.accessToken,
			),
		).toEqual(["stale", "live"]);
	});

	it("carries a dropped dir on the survivor, so it stays removable", () => {
		const first = credential({
			accessToken: "one",
			accountId: "uuid-a",
			selection: "/home/u/.claude-a",
		});
		const second = credential({
			accessToken: "two",
			accountId: "uuid-a",
			selection: "/home/u/.claude-b",
		});

		expect(
			dedupeClaudeCredentials([first, second]).map(
				(one) => one.duplicateSelections,
			),
		).toEqual([["/home/u/.claude-b"]]);
	});

	it("falls back to the token when there is no account id", () => {
		const first = credential({ accessToken: "shared" });
		const second = credential({ accessToken: "shared" });
		const third = credential({ accessToken: "other" });

		expect(
			dedupeClaudeCredentials([first, second, third, null]).map(
				(one) => one.accessToken,
			),
		).toEqual(["shared", "other"]);
	});
});

/**
 * The quota store refetches one row at a time by its config dir. A dir the
 * profile scan does not classify is the hand-exported kind: rebuilt without
 * its identity it loses the account it belongs to, and rebuilt as managed it
 * becomes a swap target Superset was never handed.
 */
describe("readCredentialForConfigDir", () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("keeps an unclassified dir's identity and its unmanaged status", async () => {
		const dir = mkdtempSync(join(tmpdir(), "superset-claude-explicit-"));
		roots.push(dir);
		writeFileSync(
			join(dir, ".credentials.json"),
			JSON.stringify({
				claudeAiOauth: {
					accessToken: "t-exported",
					refreshToken: "r",
					expiresAt: Date.now() + hour,
				},
			}),
		);
		writeFileSync(
			join(dir, ".claude.json"),
			JSON.stringify({
				oauthAccount: { accountUuid: "uuid-exported", emailAddress: "x@y.z" },
			}),
		);

		const credential = await readCredentialForConfigDir(dir);

		expect(credential).toMatchObject({
			accessToken: "t-exported",
			accountId: "uuid-exported",
			email: "x@y.z",
			selection: dir,
			managed: false,
		});
	});
});

/**
 * KTD2/KTD3: sessions run on the active dir, so the CLI refreshes the active
 * account's token there and the copy in its own store lapses about eight hours
 * later. Polling that copy reported `token_stale`, skipped the usage endpoint,
 * and left the engine switching on frozen windows.
 */
describe("fetchClaudeAccountForSelection on the active account", () => {
	const roots: string[] = [];
	let home: string;
	let previousHome: string | undefined;
	const originalFetch = globalThis.fetch;
	let tokens: string[] = [];

	function profileDir(accountId: string, oauth: Record<string, unknown>) {
		const dir = mkdtempSync(join(tmpdir(), "superset-claude-vault-"));
		roots.push(dir);
		writeProfile(dir, accountId, oauth);
		return dir;
	}

	function writeProfile(
		dir: string,
		accountId: string,
		oauth: Record<string, unknown>,
	) {
		writeFileSync(
			join(dir, ".credentials.json"),
			JSON.stringify({ claudeAiOauth: oauth }),
		);
		writeFileSync(
			join(dir, ".claude.json"),
			JSON.stringify({ oauthAccount: { accountUuid: accountId } }),
		);
	}

	function writeRuntime(activeAccountId: string, activeSelection: string) {
		const dir = join(home, "state", "account-engine");
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		const agent = {
			cooldownUntil: null,
			exhaustedNotifiedAt: null,
			fallbackTimestamps: [],
			activeAccountId: null,
			activeSelection: null,
		};
		writeFileSync(
			join(dir, "runtime.json"),
			JSON.stringify({
				version: 1,
				perAgent: {
					claude: { ...agent, activeAccountId, activeSelection },
					codex: agent,
				},
				identityBindings: {},
			}),
			{ mode: 0o600 },
		);
	}

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		home = mkdtempSync(join(tmpdir(), "superset-claude-active-"));
		roots.push(home);
		process.env.SUPERSET_HOME_DIR = home;
		tokens = [];
		globalThis.fetch = (async (
			input: Parameters<typeof fetch>[0],
			init?: RequestInit,
		) => {
			const authorization = (init?.headers as Record<string, string>)
				?.Authorization;
			if (String(input).endsWith("/usage")) {
				tokens.push(authorization ?? "");
				return new Response(
					JSON.stringify({ five_hour: { utilization: 12 } }),
					{ status: 200 },
				);
			}
			return new Response("{}", { status: 200 });
		}) as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("polls the active account with the active dir's refreshed token", async () => {
		const stale = {
			accessToken: "t-vault-stale",
			refreshToken: "r",
			expiresAt: Date.now() - hour,
			refreshTokenExpiresAt: Date.now() + 24 * hour,
		};
		const active = profileDir("uuid-active", stale);
		const other = profileDir("uuid-other", stale);
		const activeDir = activeClaudeConfigDirPath();
		mkdirSync(activeDir, { recursive: true });
		writeProfile(activeDir, "uuid-active", {
			accessToken: "t-active-dir",
			refreshToken: "r",
			expiresAt: Date.now() + hour,
		});
		writeRuntime("uuid-active", active);

		const fetched = await fetchClaudeAccountForSelection(active);

		expect(fetched.account).toMatchObject({
			status: "ok",
			accountId: "uuid-active",
			selection: active,
		});
		expect(tokens).toEqual(["Bearer t-active-dir"]);

		// Every other login keeps reading its own store, stale token and all.
		const untouched = await fetchClaudeAccountForSelection(other);

		expect(untouched.account?.status).toBe("token_stale");
		expect(tokens).toEqual(["Bearer t-active-dir"]);
	});
});

/**
 * The quota store reaps every login this pass omits, so the pass carries the
 * profile scan's completeness: that scan abandons its walk on a time budget
 * (see discoverClaudeProfilesWithStatus), and a short list is not proof an
 * account is gone.
 */
describe("discoverClaudeQuotaTargets", () => {
	afterEach(() => {
		setIdentityBindingRecorder(null);
	});

	it("reports a scan that walked to the end as complete", async () => {
		// Discovery records identity bindings through the engine state; this
		// test only cares about the scan's completeness.
		setIdentityBindingRecorder(() => {});
		// A frozen clock can never exhaust the scan budget, so a slow machine
		// cannot turn this into the truncated case.
		const clock = spyOn(Date, "now").mockReturnValue(0);
		try {
			expect((await discoverClaudeQuotaTargets()).complete).toBe(true);
		} finally {
			clock.mockRestore();
		}
	});

	// The store rebuilds a row one selection at a time, so a dir the dedupe
	// dropped only reaches it if this pass hands it over — keyed the way the
	// store keys its entries.
	it("hands over the dirs the dedupe dropped, by store entry key", async () => {
		setIdentityBindingRecorder(() => {});
		const first = mkdtempSync(join(tmpdir(), "superset-claude-dupe-a-"));
		const second = mkdtempSync(join(tmpdir(), "superset-claude-dupe-b-"));
		const roots = [first, second];
		for (const dir of roots) {
			writeFileSync(
				join(dir, ".credentials.json"),
				JSON.stringify({
					claudeAiOauth: {
						accessToken: `t-${dir}`,
						refreshToken: "r",
						expiresAt: Date.now() + hour,
					},
				}),
			);
			writeFileSync(
				join(dir, ".claude.json"),
				JSON.stringify({ oauthAccount: { accountUuid: "uuid-shared" } }),
			);
		}
		const previous = process.env.CLAUDE_CONFIG_DIR;
		process.env.CLAUDE_CONFIG_DIR = `${first},${second}`;

		try {
			const targets = await discoverClaudeQuotaTargets();

			expect(targets.selections).toContain(first);
			expect(targets.selections).not.toContain(second);
			expect(targets.duplicateSelections[`claude:${first}`]).toEqual([second]);
		} finally {
			if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
			else process.env.CLAUDE_CONFIG_DIR = previous;
			for (const root of roots) rmSync(root, { recursive: true, force: true });
		}
	});

	// Exporting CLAUDE_CONFIG_DIR at its documented default value is ordinary,
	// and profile discovery permanently excludes the default slots — so without
	// a guard here the one login is listed twice: once keyed on its account id
	// by the default read, once keyed on the same token by the explicit read,
	// which finds no <dir>/.claude.json because the default slot keeps its
	// state next door at ~/.claude.json.
	// The explicit row is built managed:false and wins the dedupe (explicit
	// comes first), so an alternate spelling of a dir discovery already found
	// silently strips that account's Make-active and rotation controls.
	it("skips an alternate spelling of an already-discovered dir", async () => {
		setIdentityBindingRecorder(() => {});
		const home = mkdtempSync(join(tmpdir(), "superset-claude-spelling-"));
		const profile = join(home, ".claude-work");
		mkdirSync(profile);
		writeFileSync(
			join(profile, ".claude.json"),
			JSON.stringify({ oauthAccount: { accountUuid: "uuid-work" } }),
		);
		writeFileSync(
			join(profile, ".credentials.json"),
			JSON.stringify({
				claudeAiOauth: {
					accessToken: "tok-work",
					refreshToken: "r",
					expiresAt: Date.now() + hour,
				},
			}),
		);
		const previous = process.env.CLAUDE_CONFIG_DIR;
		process.env.CLAUDE_CONFIG_DIR = `${profile}/`;

		try {
			const targets = await discoverClaudeQuotaTargets(home);

			expect(targets.selections).toEqual([profile]);
			expect(targets.staticAccounts).toEqual([]);
		} finally {
			if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
			else process.env.CLAUDE_CONFIG_DIR = previous;
			rmSync(home, { recursive: true, force: true });
		}
	});

	it("does not list the default slot again when CLAUDE_CONFIG_DIR names it", async () => {
		setIdentityBindingRecorder(() => {});
		const home = mkdtempSync(join(tmpdir(), "superset-claude-default-slot-"));
		const slot = join(home, ".claude");
		mkdirSync(slot);
		writeFileSync(
			join(slot, ".credentials.json"),
			JSON.stringify({
				claudeAiOauth: {
					accessToken: "tok-default",
					refreshToken: "r",
					expiresAt: Date.now() + hour,
				},
			}),
		);
		// The default slot's state lives beside the dir, not inside it.
		writeFileSync(
			join(home, ".claude.json"),
			JSON.stringify({ oauthAccount: { accountUuid: "uuid-default" } }),
		);
		const previous = process.env.CLAUDE_CONFIG_DIR;
		process.env.CLAUDE_CONFIG_DIR = slot;

		try {
			expect((await discoverClaudeQuotaTargets(home)).selections).not.toContain(
				slot,
			);
		} finally {
			if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
			else process.env.CLAUDE_CONFIG_DIR = previous;
			rmSync(home, { recursive: true, force: true });
		}
	});
});
