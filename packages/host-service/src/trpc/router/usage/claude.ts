/**
 * Claude subscription quota, read the same way CodexBar/runway/claudebar do:
 * the Claude Code OAuth token already on this machine, sent to the
 * undocumented `api.anthropic.com/api/oauth/usage` endpoint.
 *
 * Hard rule: tokens are read-only. If one is expired we report
 * `token_stale` (refresh token still good — the CLI refreshes on its next
 * run) or `token_expired` instead of refreshing — a second client
 * refreshing the token can trip Anthropic's token-reuse protection and sign
 * the CLI out.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { discoverClaudeProfiles, readKeychainSecrets } from "./profiles";
import type { UsageAccount, UsageQuotaWindow } from "./types";

const CLAUDE_KEYCHAIN_SERVICE = "Claude Code-credentials";
const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_PROFILE_URL = "https://api.anthropic.com/api/oauth/profile";
const CLAUDE_OAUTH_BETA_HEADER = "oauth-2025-04-20";
const FETCH_TIMEOUT_MS = 10_000;

export interface ClaudeOauthCredential {
	accessToken: string;
	expiresAt: number | null;
	refreshTokenExpiresAt: number | null;
	subscriptionType: string | null;
	accountKey: string;
	sourceLabel: string;
	/** Config dir to inject as CLAUDE_CONFIG_DIR to run on this login; null
	 * for the system-default login. */
	selection: string | null;
	/** Identity from the profile's own state file, when known. */
	email?: string | null;
}

interface ClaudeCredentialFile {
	claudeAiOauth?: {
		accessToken?: string;
		expiresAt?: number;
		refreshToken?: string;
		refreshTokenExpiresAt?: number;
		subscriptionType?: string;
	};
}

function parseCredential(
	raw: string,
	accountKey: string,
	sourceLabel: string,
	selection: string | null,
): ClaudeOauthCredential | null {
	try {
		const parsed: ClaudeCredentialFile = JSON.parse(raw);
		const oauth = parsed.claudeAiOauth;
		if (!oauth?.accessToken) return null;
		return {
			accessToken: oauth.accessToken,
			expiresAt: typeof oauth.expiresAt === "number" ? oauth.expiresAt : null,
			refreshTokenExpiresAt:
				typeof oauth.refreshToken === "string" &&
				oauth.refreshToken.length > 0 &&
				typeof oauth.refreshTokenExpiresAt === "number"
					? oauth.refreshTokenExpiresAt
					: null,
			subscriptionType:
				typeof oauth.subscriptionType === "string"
					? oauth.subscriptionType
					: null,
			accountKey,
			sourceLabel,
			selection,
		};
	} catch {
		return null;
	}
}

async function readCredentialFile(
	path: string,
	sourceLabel: string,
	selection: string | null,
): Promise<ClaudeOauthCredential | null> {
	try {
		const raw = await readFile(path, "utf-8");
		return parseCredential(raw, path, sourceLabel, selection);
	} catch {
		return null;
	}
}

/** The default login's Keychain item: the freshest of the items sharing its
 * service, since a sibling without a Claude login can sit beside it. */
async function readKeychainCredential(): Promise<ClaudeOauthCredential | null> {
	const secrets = await readKeychainSecrets(CLAUDE_KEYCHAIN_SERVICE);
	return pickFreshest(
		secrets.map((secret) =>
			parseCredential(
				secret,
				`keychain:${CLAUDE_KEYCHAIN_SERVICE}`,
				"Keychain",
				null,
			),
		),
	);
}

export const STALE_TOKEN_DETAIL = "Refreshes when Claude Code next runs.";
export const EXPIRED_TOKEN_DETAIL =
	"Sign-in expired — run /login in Claude Code.";

/**
 * Claude Code access tokens live about eight hours and the CLI renews them
 * silently from the refresh token on its next run, so a lapsed access token
 * alone does not mean the login is gone. Only a lapsed (or absent) refresh
 * token does.
 */
export function classifyLapsedToken(
	credential: Pick<
		ClaudeOauthCredential,
		"expiresAt" | "refreshTokenExpiresAt"
	>,
	now = Date.now(),
): "live" | "token_stale" | "token_expired" {
	if (credential.expiresAt === null || credential.expiresAt > now) {
		return "live";
	}
	if (
		credential.refreshTokenExpiresAt !== null &&
		credential.refreshTokenExpiresAt > now
	) {
		return "token_stale";
	}
	return "token_expired";
}

const LAPSED_RANK = { live: 2, token_stale: 1, token_expired: 0 } as const;

/** Live beats stale beats expired; among equals the latest expiry wins. */
export function pickFreshest<T extends ClaudeOauthCredential>(
	candidates: Array<T | null>,
	now = Date.now(),
): T | null {
	let best: T | null = null;
	for (const candidate of candidates) {
		if (!candidate) continue;
		if (!best) {
			best = candidate;
			continue;
		}
		const rank = LAPSED_RANK[classifyLapsedToken(candidate, now)];
		const bestRank = LAPSED_RANK[classifyLapsedToken(best, now)];
		if (
			rank > bestRank ||
			(rank === bestRank &&
				(candidate.expiresAt ?? Number.POSITIVE_INFINITY) >
					(best.expiresAt ?? Number.POSITIVE_INFINITY))
		) {
			best = candidate;
		}
	}
	return best;
}

/** Identity of the default login, readable even when its token is expired. */
export async function readDefaultLoginEmail(): Promise<string | null> {
	try {
		const parsed = JSON.parse(
			await readFile(join(homedir(), ".claude.json"), "utf-8"),
		) as { oauthAccount?: { emailAddress?: string } };
		return parsed.oauthAccount?.emailAddress ?? null;
	} catch {
		return null;
	}
}

/**
 * Discovers Claude logins on this machine: the default config locations,
 * any CLAUDE_CONFIG_DIR entries (comma-list supported), auto-discovered
 * profile dirs (runway's multi-account model — see profiles.ts), and the
 * Claude Code Keychain items. Deduped by token.
 *
 * The Keychain item, `~/.claude/.credentials.json`, and
 * `~/.config/claude/credentials.json` are ONE login slot: /login rewrites
 * whichever store the CLI prefers and leaves stale copies in the others, so
 * only the freshest of the three surfaces (a stale sibling would otherwise
 * render as a phantom expired account).
 */
async function discoverClaudeCredentials(): Promise<{
	credentials: ClaudeOauthCredential[];
	signedOutProfiles: Awaited<ReturnType<typeof discoverClaudeProfiles>>;
}> {
	const home = homedir();
	const defaultCandidates: Array<{ path: string; sourceLabel: string }> = [
		{
			path: join(home, ".claude", ".credentials.json"),
			sourceLabel: "~/.claude",
		},
		{
			path: join(home, ".config", "claude", "credentials.json"),
			sourceLabel: "~/.config/claude",
		},
	];
	const explicitCandidates: Array<{
		path: string;
		sourceLabel: string;
		configDir: string;
	}> = [];
	for (const dir of (process.env.CLAUDE_CONFIG_DIR ?? "").split(",")) {
		const configDir = dir.trim();
		if (!configDir) continue;
		explicitCandidates.push({
			path: join(configDir, ".credentials.json"),
			sourceLabel: configDir.replace(home, "~"),
			configDir,
		});
	}

	const readProfileCredential = async (
		profile: Awaited<ReturnType<typeof discoverClaudeProfiles>>[number],
	): Promise<ClaudeOauthCredential | null> => {
		const fromFile = await readCredentialFile(
			profile.credentialsPath,
			profile.sourceLabel,
			profile.configDir,
		);
		const candidates: Array<ClaudeOauthCredential | null> = [fromFile];
		for (const service of profile.keychainServices) {
			for (const secret of await readKeychainSecrets(service)) {
				candidates.push(
					parseCredential(
						secret,
						profile.configDir,
						profile.sourceLabel,
						profile.configDir,
					),
				);
			}
		}
		const freshest = pickFreshest(candidates);
		return freshest ? { ...freshest, email: profile.email } : null;
	};

	const profiles = await discoverClaudeProfiles();
	const [defaultEmail, keychainCredential, defaultFiles, explicit, profiled] =
		await Promise.all([
			readDefaultLoginEmail(),
			readKeychainCredential(),
			Promise.all(
				defaultCandidates.map(({ path, sourceLabel }) =>
					readCredentialFile(path, sourceLabel, null),
				),
			),
			Promise.all(
				explicitCandidates.map(({ path, sourceLabel, configDir }) =>
					readCredentialFile(path, sourceLabel, configDir),
				),
			),
			Promise.all(profiles.map(readProfileCredential)),
		]);

	const defaultCredential = pickFreshest([keychainCredential, ...defaultFiles]);
	if (defaultCredential && !defaultCredential.email && defaultEmail) {
		defaultCredential.email = defaultEmail;
	}

	const byToken = new Map<string, ClaudeOauthCredential>();
	for (const credential of [defaultCredential, ...explicit, ...profiled]) {
		if (credential && !byToken.has(credential.accessToken)) {
			byToken.set(credential.accessToken, credential);
		}
	}
	// Profiles with an identity but no readable credential (logged out, or a
	// login that died half-way) still surface so the UI can offer re-sign-in
	// and removal — otherwise the dir exists but nothing shows it.
	const signedOutProfiles = profiles.filter(
		(_profile, index) => profiled[index] === null,
	);
	return { credentials: [...byToken.values()], signedOutProfiles };
}

interface ClaudeUsageWindow {
	utilization?: number;
	resets_at?: string;
}

interface ClaudeUsageResponse {
	five_hour?: ClaudeUsageWindow;
	seven_day?: ClaudeUsageWindow;
	seven_day_sonnet?: ClaudeUsageWindow;
	limits?: Array<{
		kind?: string;
		percent?: number;
		resets_at?: string;
		scope?: { model?: { display_name?: string } };
	}>;
	extra_usage?: { monthly_limit?: number; used_credits?: number };
}

interface ClaudeProfileResponse {
	account?: { email?: string; email_address?: string };
	email?: string;
}

function toWindow(
	id: string,
	label: string,
	window: ClaudeUsageWindow | undefined,
): UsageQuotaWindow | null {
	if (!window || typeof window.utilization !== "number") return null;
	return {
		id,
		label,
		usedPercent: Math.max(0, Math.round(window.utilization)),
		resetsAt: window.resets_at ? new Date(window.resets_at) : null,
	};
}

function mapWindows(usage: ClaudeUsageResponse): UsageQuotaWindow[] {
	const windows: UsageQuotaWindow[] = [];
	const session = toWindow("five_hour", "Session (5h)", usage.five_hour);
	if (session) windows.push(session);
	const weekly = toWindow("seven_day", "Weekly", usage.seven_day);
	if (weekly) windows.push(weekly);
	const sonnet = toWindow(
		"seven_day_sonnet",
		"Weekly · Sonnet",
		usage.seven_day_sonnet,
	);
	if (sonnet) windows.push(sonnet);

	for (const limit of usage.limits ?? []) {
		if (limit.kind !== "weekly_scoped" || typeof limit.percent !== "number") {
			continue;
		}
		const modelName = limit.scope?.model?.display_name;
		if (!modelName) continue;
		const label = `Weekly · ${modelName}`;
		if (windows.some((existing) => existing.label === label)) continue;
		windows.push({
			id: `weekly_scoped:${modelName}`,
			label,
			usedPercent: Math.max(0, Math.round(limit.percent)),
			resetsAt: limit.resets_at ? new Date(limit.resets_at) : null,
		});
	}
	return windows;
}

async function fetchClaudeProfileEmail(
	accessToken: string,
): Promise<string | null> {
	try {
		const response = await fetch(CLAUDE_PROFILE_URL, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"anthropic-beta": CLAUDE_OAUTH_BETA_HEADER,
			},
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!response.ok) return null;
		const profile = (await response.json()) as ClaudeProfileResponse;
		return (
			profile.account?.email ??
			profile.account?.email_address ??
			profile.email ??
			null
		);
	} catch {
		return null;
	}
}

async function fetchClaudeAccount(
	credential: ClaudeOauthCredential,
): Promise<UsageAccount> {
	const base = {
		agent: "claude" as const,
		accountKey: credential.accountKey,
		sourceLabel: credential.sourceLabel,
		plan: credential.subscriptionType,
		creditsBalance: null,
		selection: credential.selection,
		// Decorated per-query from host settings; the quota cache outlives it.
		isDefault: false,
		fetchedAt: new Date(),
	};

	const lapsed = classifyLapsedToken(credential);
	if (lapsed !== "live") {
		return {
			...base,
			email: credential.email ?? null,
			status: lapsed,
			statusDetail:
				lapsed === "token_stale" ? STALE_TOKEN_DETAIL : EXPIRED_TOKEN_DETAIL,
			windows: [],
			extraUsage: null,
		};
	}

	try {
		const [usageResponse, apiEmail] = await Promise.all([
			fetch(CLAUDE_USAGE_URL, {
				headers: {
					Authorization: `Bearer ${credential.accessToken}`,
					"anthropic-beta": CLAUDE_OAUTH_BETA_HEADER,
				},
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			}),
			fetchClaudeProfileEmail(credential.accessToken),
		]);

		if (usageResponse.status === 401 || usageResponse.status === 403) {
			return {
				...base,
				email: apiEmail ?? credential.email ?? null,
				status: "token_expired",
				statusDetail: EXPIRED_TOKEN_DETAIL,
				windows: [],
				extraUsage: null,
			};
		}
		if (!usageResponse.ok) {
			return {
				...base,
				email: apiEmail ?? credential.email ?? null,
				status: "unavailable",
				statusDetail: `Usage endpoint returned ${usageResponse.status}.`,
				windows: [],
				extraUsage: null,
			};
		}

		const usage = (await usageResponse.json()) as ClaudeUsageResponse;
		const windows = mapWindows(usage);
		const extraUsage =
			typeof usage.extra_usage?.used_credits === "number" &&
			typeof usage.extra_usage?.monthly_limit === "number"
				? {
						usedCents: usage.extra_usage.used_credits,
						limitCents: usage.extra_usage.monthly_limit,
					}
				: null;

		if (windows.length === 0) {
			return {
				...base,
				email: apiEmail ?? credential.email ?? null,
				status: "unavailable",
				statusDetail:
					"No quota data returned (org-managed and education plans do not expose limits).",
				windows: [],
				extraUsage,
			};
		}

		return {
			...base,
			email: apiEmail ?? credential.email ?? null,
			status: "ok",
			statusDetail: null,
			windows,
			extraUsage,
		};
	} catch (error) {
		return {
			...base,
			email: credential.email ?? null,
			status: "unavailable",
			statusDetail:
				error instanceof Error ? error.message : "Failed to fetch usage.",
			windows: [],
			extraUsage: null,
		};
	}
}

export async function fetchClaudeAccounts(): Promise<UsageAccount[]> {
	const { credentials, signedOutProfiles } = await discoverClaudeCredentials();
	const accounts = await Promise.all(credentials.map(fetchClaudeAccount));
	for (const profile of signedOutProfiles) {
		accounts.push({
			agent: "claude",
			accountKey: profile.configDir,
			sourceLabel: profile.sourceLabel,
			email: profile.email,
			plan: null,
			status: "signed_out",
			statusDetail:
				"Signed out — use Switch sign-in to reconnect, or Remove to delete this profile.",
			windows: [],
			creditsBalance: null,
			extraUsage: null,
			selection: profile.configDir,
			isDefault: false,
			fetchedAt: new Date(),
		});
	}
	return accounts;
}
