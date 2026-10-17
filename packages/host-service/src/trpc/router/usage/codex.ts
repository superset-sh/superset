/**
 * Codex subscription quota from the ChatGPT backend `wham/usage` endpoint,
 * using the OAuth token the Codex CLI already stores in `$CODEX_HOME/auth.json`.
 * Read-only: we never refresh the token (see claude.ts for why).
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { type CodexHome, discoverCodexHomes } from "./profiles";
import type { QuotaSnapshot } from "./quota-cache";
import {
	parseQuotaCredentialJson,
	QuotaCredentialReadError,
	readQuotaCredentialFile,
	unavailableQuotaAccount,
} from "./quota-credentials";
import type {
	UsageAccount,
	UsageAccountStatus,
	UsageQuotaWindow,
} from "./types";

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const FETCH_TIMEOUT_MS = 10_000;

interface CodexAuthFile {
	tokens?: {
		access_token?: string;
		account_id?: string;
	};
}

interface CodexRateLimitWindow {
	used_percent?: number;
	limit_window_seconds?: number;
	reset_at?: number;
	reset_after_seconds?: number;
}

interface CodexRateLimit {
	primary_window?: CodexRateLimitWindow | null;
	secondary_window?: CodexRateLimitWindow | null;
}

interface CodexUsageResponse {
	email?: string;
	plan_type?: string;
	rate_limit?: CodexRateLimit;
	additional_rate_limits?: Array<{
		limit_name?: string;
		rate_limit?: CodexRateLimit;
	}>;
	credits?: { balance?: string };
}

function windowLabel(limitWindowSeconds: number | undefined): string {
	if (limitWindowSeconds === undefined) return "Limit";
	const hours = Math.round(limitWindowSeconds / 3600);
	if (hours <= 5) return `Session (${hours}h)`;
	if (hours === 168) return "Weekly";
	if (hours % 24 === 0) return `${hours / 24}d`;
	return `${hours}h`;
}

function toWindow(
	id: string,
	labelPrefix: string,
	window: CodexRateLimitWindow | null | undefined,
): UsageQuotaWindow | null {
	if (!window || typeof window.used_percent !== "number") return null;
	const label = labelPrefix
		? `${windowLabel(window.limit_window_seconds)} · ${labelPrefix}`
		: windowLabel(window.limit_window_seconds);
	const resetsAt =
		typeof window.reset_at === "number"
			? new Date(window.reset_at * 1000)
			: typeof window.reset_after_seconds === "number"
				? new Date(Date.now() + window.reset_after_seconds * 1000)
				: null;
	return {
		id,
		label,
		usedPercent: Math.max(0, Math.round(window.used_percent)),
		resetsAt,
	};
}

function mapWindows(usage: CodexUsageResponse): UsageQuotaWindow[] {
	const windows: UsageQuotaWindow[] = [];
	const primary = toWindow("primary", "", usage.rate_limit?.primary_window);
	if (primary) windows.push(primary);
	const secondary = toWindow(
		"secondary",
		"",
		usage.rate_limit?.secondary_window,
	);
	if (secondary) windows.push(secondary);

	for (const [index, extra] of (usage.additional_rate_limits ?? []).entries()) {
		const name = extra.limit_name ?? `limit_${index}`;
		const window = toWindow(
			`additional:${name}`,
			name,
			extra.rate_limit?.primary_window,
		);
		if (window) windows.push(window);
	}
	return windows;
}

export async function fetchCodexAccounts(): Promise<UsageAccount[]> {
	const homes = await discoverCodexHomes();
	// The first discovered home is what codex uses with no CODEX_HOME override
	// (see discoverCodexHomes) — running on it needs no env injection.
	const defaultHome = homes[0]?.home ?? null;
	const accounts = await Promise.all(
		homes.map((home) =>
			fetchCodexAccountForHome(home, home.home === defaultHome),
		),
	);
	// Dedupe by account email — one login used from several homes is one
	// account; keep the first (default home wins).
	return deduplicateCodexAccounts(accounts.flat());
}

function deduplicateCodexAccounts(accounts: UsageAccount[]): UsageAccount[] {
	const seen = new Set<string>();
	return accounts.filter((account) => {
		const key = account.email ?? account.accountKey;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export async function captureCodexQuotaSnapshot(
	captureHomes = () => discoverCodexHomes({ includeUnavailable: true }),
	fetchQuota = fetchCodexSubscriptionQuota,
): Promise<QuotaSnapshot<UsageAccount[]>> {
	let homes: CodexHome[];
	try {
		homes = structuredClone(await captureHomes());
	} catch {
		return {
			revision: "codex:discovery-unavailable",
			load: async () => [
				unavailableQuotaAccount({
					agent: "codex",
					accountKey: "codex:discovery",
					sourceLabel: "Codex accounts",
					selection: null,
				}),
			],
		};
	}
	const inputs = await Promise.all(
		homes.map(async (home, index) => {
			const source = {
				agent: "codex" as const,
				accountKey: join(home.home, "auth.json"),
				sourceLabel: home.home.replace(homedir(), "~"),
				selection: index === 0 ? null : home.home,
			};
			try {
				if (home.quotaUnavailable)
					return { state: "unavailable" as const, source };
				return {
					state: "available" as const,
					home,
					isDefaultHome: index === 0,
					auth:
						home.credentialKind === "api_key"
							? null
							: await readCodexQuotaAuth(home.home),
				};
			} catch {
				return { state: "unavailable" as const, source };
			}
		}),
	);
	const revision = createHash("sha256")
		.update(JSON.stringify(inputs))
		.digest("hex");
	return {
		revision,
		load: async () =>
			deduplicateCodexAccounts(
				(
					await Promise.all(
						inputs.map((input) =>
							input.state === "unavailable"
								? [unavailableQuotaAccount(input.source)]
								: fetchCodexAccountForHome(
										input.home,
										input.isDefaultHome,
										input.auth,
										fetchQuota,
									),
						),
					)
				).flat(),
			),
	};
}

async function readCodexQuotaAuth(home: string): Promise<CodexAuthFile | null> {
	const config = await readQuotaCredentialFile(join(home, "config.toml"));
	if (config !== null) {
		try {
			const parsed = parseToml(config);
			if (
				parsed.cli_auth_credentials_store !== undefined &&
				parsed.cli_auth_credentials_store !== "file"
			)
				throw new QuotaCredentialReadError();
		} catch {
			throw new QuotaCredentialReadError();
		}
	}
	const raw = await readQuotaCredentialFile(join(home, "auth.json"));
	if (raw === null) return null;
	const parsed = parseQuotaCredentialJson(raw);
	if (parsed.auth_mode !== undefined && parsed.auth_mode !== "chatgpt")
		throw new QuotaCredentialReadError();
	if (parsed.tokens === undefined || parsed.tokens === null) return null;
	if (typeof parsed.tokens !== "object" || Array.isArray(parsed.tokens))
		throw new QuotaCredentialReadError();
	const tokens = parsed.tokens as Record<string, unknown>;
	if (
		typeof tokens.access_token !== "string" ||
		!tokens.access_token.trim() ||
		(tokens.account_id != null && typeof tokens.account_id !== "string")
	)
		throw new QuotaCredentialReadError();
	return {
		tokens: {
			access_token: tokens.access_token,
			account_id: (tokens.account_id ?? undefined) as string | undefined,
		},
	};
}

/** What the ChatGPT usage endpoint says about one access token. */
export interface CodexSubscriptionQuota {
	email: string | null;
	plan: string | null;
	status: UsageAccountStatus;
	statusDetail: string | null;
	windows: UsageQuotaWindow[];
	creditsBalance: number | null;
}

export const CODEX_EXPIRED_TOKEN_DETAIL =
	"Codex token expired — run `codex` to refresh it.";

/**
 * Reads the subscription quota behind a ChatGPT OAuth access token. The
 * OpenCode reader shares this: its OpenAI login is the same OAuth client.
 */
export async function fetchCodexSubscriptionQuota(
	accessToken: string,
	accountId?: string,
): Promise<CodexSubscriptionQuota> {
	const empty = { email: null, plan: null, windows: [], creditsBalance: null };
	try {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${accessToken}`,
		};
		if (accountId) headers["chatgpt-account-id"] = accountId;
		const response = await fetch(CODEX_USAGE_URL, {
			headers,
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});

		if (response.status === 401 || response.status === 403) {
			return {
				...empty,
				status: "token_expired",
				statusDetail: CODEX_EXPIRED_TOKEN_DETAIL,
			};
		}
		if (!response.ok) {
			return {
				...empty,
				status: "unavailable",
				statusDetail: `Usage endpoint returned ${response.status}.`,
			};
		}

		const usage = (await response.json()) as CodexUsageResponse;
		const windows = mapWindows(usage);
		const balance = Number.parseFloat(usage.credits?.balance ?? "");
		return {
			email: usage.email ?? null,
			plan: usage.plan_type ?? null,
			status: windows.length > 0 ? "ok" : "unavailable",
			statusDetail:
				windows.length > 0 ? null : "No quota data returned for this plan.",
			windows,
			creditsBalance: Number.isFinite(balance) ? balance : null,
		};
	} catch (error) {
		return {
			...empty,
			status: "unavailable",
			statusDetail:
				error instanceof Error ? error.message : "Failed to fetch usage.",
		};
	}
}

async function fetchCodexAccountForHome(
	home: CodexHome,
	isDefaultHome: boolean,
	capturedAuth?: CodexAuthFile | null,
	fetchQuota = fetchCodexSubscriptionQuota,
): Promise<UsageAccount[]> {
	const codexHome = home.home;
	const authPath = join(codexHome, "auth.json");
	const base = {
		agent: "codex" as const,
		credentialKind: home.credentialKind,
		accountKey: authPath,
		sourceLabel: codexHome.replace(homedir(), "~"),
		extraUsage: null,
		selection: isDefaultHome ? null : codexHome,
		// Decorated per-query from host settings; the quota cache outlives it.
		isDefault: false,
		fetchedAt: new Date(),
	};

	// API billing has no quota endpoint, and the auth.json holds the raw key —
	// the card is built from the marker alone.
	if (home.credentialKind === "api_key") {
		return [
			{
				...base,
				email: null,
				plan: null,
				status: "ok",
				statusDetail:
					"Billed per token through the OpenAI Platform — no quota windows.",
				windows: [],
				creditsBalance: null,
			},
		];
	}

	let auth: CodexAuthFile;
	try {
		auth =
			capturedAuth === undefined
				? JSON.parse(await readFile(authPath, "utf-8"))
				: (capturedAuth ?? {});
	} catch {
		return [];
	}
	const accessToken = auth.tokens?.access_token;
	if (!accessToken) return [];

	const quota = await fetchQuota(accessToken, auth.tokens?.account_id);
	return [{ ...base, ...quota }];
}
