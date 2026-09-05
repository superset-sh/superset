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
import { recordIdentityBindings } from "./default-account";
import {
	type ClaudeProfile,
	discoverClaudeProfiles,
	isActiveClaudeConfigDir,
	readClaudeIdentity,
	readKeychainSecrets,
} from "./profiles";
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
	/** KTD4: `oauthAccount.accountUuid` — the provider's account identity,
	 * which is what dedupes logins. Null when the state file names none. */
	accountId: string | null;
	/** False for a config dir the user exported by hand: Superset lists it
	 * but never swaps a login into it. */
	managed: boolean;
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
			accountId: null,
			managed: true,
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

/**
 * Identity of the default login (KTD14: its state file is `~/.claude.json`,
 * next door to its store), readable even when its token is expired.
 */
export async function readDefaultLoginIdentity(): Promise<{
	email: string | null;
	accountId: string | null;
}> {
	try {
		const parsed = JSON.parse(
			await readFile(join(homedir(), ".claude.json"), "utf-8"),
		) as { oauthAccount?: { emailAddress?: string; accountUuid?: string } };
		return {
			email: parsed.oauthAccount?.emailAddress ?? null,
			accountId: parsed.oauthAccount?.accountUuid ?? null,
		};
	} catch {
		return { email: null, accountId: null };
	}
}

export async function readDefaultLoginEmail(): Promise<string | null> {
	return (await readDefaultLoginIdentity()).email;
}

/** The one login slot the CLI uses with no CLAUDE_CONFIG_DIR override. */
function defaultCredentialCandidates(
	home: string,
): Array<{ path: string; sourceLabel: string }> {
	return [
		{
			path: join(home, ".claude", ".credentials.json"),
			sourceLabel: "~/.claude",
		},
		{
			path: join(home, ".config", "claude", "credentials.json"),
			sourceLabel: "~/.config/claude",
		},
	];
}

async function readDefaultCredential(): Promise<ClaudeOauthCredential | null> {
	const home = homedir();
	const [identity, keychainCredential, defaultFiles] = await Promise.all([
		readDefaultLoginIdentity(),
		readKeychainCredential(),
		Promise.all(
			defaultCredentialCandidates(home).map(({ path, sourceLabel }) =>
				readCredentialFile(path, sourceLabel, null),
			),
		),
	]);
	const credential = pickFreshest([keychainCredential, ...defaultFiles]);
	if (credential && !credential.email && identity.email) {
		credential.email = identity.email;
	}
	if (credential) credential.accountId = identity.accountId;
	return credential;
}

async function readProfileCredential(
	profile: ClaudeProfile,
): Promise<ClaudeOauthCredential | null> {
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
	return freshest
		? { ...freshest, email: profile.email, accountId: profile.accountId }
		: null;
}

/**
 * Discovers Claude logins on this machine: the default config locations,
 * any CLAUDE_CONFIG_DIR entries (comma-list supported), auto-discovered
 * profile dirs (runway's multi-account model — see profiles.ts), and the
 * Claude Code Keychain items. Deduped by account identity (KTD4).
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
	apiProfiles: Awaited<ReturnType<typeof discoverClaudeProfiles>>;
}> {
	const home = homedir();
	// API-billed profiles have no quota to fetch and their credentials stay
	// unread; only subscription profiles go through the credential readers.
	const allProfiles = await discoverClaudeProfiles();
	const profiles = allProfiles.filter(
		(profile) => profile.credentialKind === "subscription",
	);
	const apiProfiles = allProfiles.filter(
		(profile) => profile.credentialKind === "api_key",
	);
	const discoveredDirs = new Set(
		allProfiles.map((profile) => profile.configDir),
	);

	// CLAUDE_CONFIG_DIR entries profile discovery does not classify. One that
	// it does classify is left to the profiled read: read from both, the same
	// account would key on its id once and on its token the other time and
	// list twice.
	const explicitCandidates: Array<{
		path: string;
		sourceLabel: string;
		configDir: string;
	}> = [];
	for (const dir of (process.env.CLAUDE_CONFIG_DIR ?? "").split(",")) {
		const configDir = dir.trim();
		if (!configDir || discoveredDirs.has(configDir)) continue;
		// The host-service may itself be launched on the active dir; it holds a
		// copy of the account that is active, not an account of its own (KTD4).
		if (await isActiveClaudeConfigDir(configDir)) continue;
		explicitCandidates.push({
			path: join(configDir, ".credentials.json"),
			sourceLabel: configDir.replace(home, "~"),
			configDir,
		});
	}

	const [defaultCredential, explicit, profiled] = await Promise.all([
		readDefaultCredential(),
		Promise.all(
			explicitCandidates.map(async ({ path, sourceLabel, configDir }) => {
				const credential = await readCredentialFile(
					path,
					sourceLabel,
					configDir,
				);
				if (!credential) return null;
				const identity = await readClaudeIdentity(configDir);
				return {
					...credential,
					email: identity?.email ?? null,
					accountId: identity?.accountId ?? null,
					// A dir the user exported by hand is Superset's to read,
					// never to write: it is listed, but no swap targets it.
					managed: false,
				};
			}),
		),
		Promise.all(profiles.map(readProfileCredential)),
	]);

	const credentials = dedupeClaudeCredentials([
		defaultCredential,
		...explicit,
		...profiled,
	]);
	// KTD3 step 2: the swap needs to know which dir owns each identity, and
	// this is the only pass that sees both.
	recordIdentityBindings(
		credentials.flatMap((credential) =>
			credential.accountId
				? [[credential.accountId, credential.selection] as const]
				: [],
		),
	);
	// Profiles with an identity but no readable credential (logged out, or a
	// login that died half-way) still surface so the UI can offer re-sign-in
	// and removal — otherwise the dir exists but nothing shows it.
	const signedOutProfiles = profiles.filter(
		(_profile, index) => profiled[index] === null,
	);
	return { credentials, signedOutProfiles, apiProfiles };
}

/**
 * One login per provider account (KTD4). A swap leaves the same access token
 * in the active dir and in the owner's profile for a while, so the token only
 * keys the logins that carry no account id — API-key logins, and a state file
 * too old to name one.
 */
export function dedupeClaudeCredentials(
	candidates: Array<ClaudeOauthCredential | null>,
): ClaudeOauthCredential[] {
	const byIdentity = new Map<string, ClaudeOauthCredential>();
	for (const credential of candidates) {
		if (!credential) continue;
		const key = credential.accountId
			? `id:${credential.accountId}`
			: `token:${credential.accessToken}`;
		if (!byIdentity.has(key)) byIdentity.set(key, credential);
	}
	return [...byIdentity.values()];
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
	/** The usage endpoint's HTTP status, so a poller can see a 429. */
	onHttpStatus?: (status: number) => void,
): Promise<UsageAccount> {
	const base = {
		agent: "claude" as const,
		credentialKind: "subscription" as const,
		accountKey: credential.accountKey,
		sourceLabel: credential.sourceLabel,
		plan: credential.subscriptionType,
		creditsBalance: null,
		selection: credential.selection,
		accountId: credential.accountId,
		// R16: subscription logins rotate by default; the per-account toggle
		// and the active badge are decorated per query, since the quota cache
		// outlives both.
		inRotation: true,
		managed: credential.managed,
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
		onHttpStatus?.(usageResponse.status);

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

/** An API-billed profile: no quota endpoint, so the card is built locally. */
function claudeApiKeyAccount(profile: ClaudeProfile): UsageAccount {
	return {
		agent: "claude",
		credentialKind: "api_key",
		accountKey: profile.configDir,
		sourceLabel: profile.sourceLabel,
		email: profile.email,
		plan: null,
		status: "ok",
		statusDetail:
			"Billed per token through the Anthropic Console — no quota windows.",
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		selection: profile.configDir,
		accountId: profile.accountId,
		// R16: rotating onto a pay-per-token login would spend money silently.
		inRotation: false,
		managed: true,
		isDefault: false,
		fetchedAt: new Date(),
	};
}

/** A profile with an identity but no readable credential. */
function claudeSignedOutAccount(profile: ClaudeProfile): UsageAccount {
	return {
		agent: "claude",
		credentialKind: "subscription",
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
		accountId: profile.accountId,
		inRotation: true,
		managed: true,
		isDefault: false,
		fetchedAt: new Date(),
	};
}

export async function fetchClaudeAccounts(): Promise<UsageAccount[]> {
	const { credentials, signedOutProfiles, apiProfiles } =
		await discoverClaudeCredentials();
	const accounts = await Promise.all(
		credentials.map((credential) => fetchClaudeAccount(credential)),
	);
	accounts.push(...apiProfiles.map(claudeApiKeyAccount));
	accounts.push(...signedOutProfiles.map(claudeSignedOutAccount));
	return accounts;
}

/**
 * The quota store's discovery pass (KTD10): which logins have a credential
 * worth polling, and the rows that have no fetch of their own.
 */
export async function discoverClaudeQuotaTargets(): Promise<{
	selections: Array<string | null>;
	staticAccounts: UsageAccount[];
}> {
	const { credentials, signedOutProfiles, apiProfiles } =
		await discoverClaudeCredentials();
	return {
		selections: credentials.map((credential) => credential.selection),
		staticAccounts: [
			...apiProfiles.map(claudeApiKeyAccount),
			...signedOutProfiles.map(claudeSignedOutAccount),
		],
	};
}

async function readCredentialForConfigDir(
	configDir: string,
): Promise<ClaudeOauthCredential | null> {
	const profile = (await discoverClaudeProfiles()).find(
		(candidate) => candidate.configDir === configDir,
	);
	if (profile) {
		return profile.credentialKind === "subscription"
			? readProfileCredential(profile)
			: null;
	}
	// A CLAUDE_CONFIG_DIR entry that profile discovery does not classify.
	return readCredentialFile(
		join(configDir, ".credentials.json"),
		configDir.replace(homedir(), "~"),
		configDir,
	);
}

/**
 * One login's quota, for the quota store's per-account cadence. `rateLimited`
 * is the 429 that backs off every poll on this endpoint (KTD10).
 */
export async function fetchClaudeAccountForSelection(
	selection: string | null,
): Promise<{ account: UsageAccount | null; rateLimited: boolean }> {
	const credential =
		selection === null
			? await readDefaultCredential()
			: await readCredentialForConfigDir(selection);
	if (!credential) return { account: null, rateLimited: false };
	let rateLimited = false;
	const account = await fetchClaudeAccount(credential, (status) => {
		rateLimited = status === 429;
	});
	return { account, rateLimited };
}
