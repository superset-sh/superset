/**
 * Codex subscription quota from the ChatGPT backend `wham/usage` endpoint,
 * using the OAuth token the Codex CLI already stores in `$CODEX_HOME/auth.json`.
 * Read-only: we never refresh the token (see claude.ts for why).
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type CodexHome, discoverCodexHomes } from "./profiles";
import type { UsageAccount, UsageQuotaWindow } from "./types";

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
	return dedupeCodexAccounts(accounts.flat());
}

/**
 * Dedupe by account email — one login used from several homes is one
 * account; keep the first (default home wins).
 */
export function dedupeCodexAccounts(accounts: UsageAccount[]): UsageAccount[] {
	const seen = new Set<string>();
	return accounts.filter((account) => {
		const key = account.email ?? account.accountKey;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * The quota store's discovery pass (KTD10): the homes worth polling, and the
 * API-billed rows that have no quota endpoint to call.
 */
export async function discoverCodexQuotaTargets(): Promise<{
	selections: Array<string | null>;
	staticAccounts: UsageAccount[];
}> {
	const homes = await discoverCodexHomes();
	const defaultHome = homes[0]?.home ?? null;
	const selections: Array<string | null> = [];
	const staticAccounts: UsageAccount[] = [];
	for (const home of homes) {
		const isDefaultHome = home.home === defaultHome;
		if (home.credentialKind === "api_key") {
			staticAccounts.push(codexApiKeyAccount(home, isDefaultHome));
		} else {
			selections.push(isDefaultHome ? null : home.home);
		}
	}
	return { selections, staticAccounts };
}

/**
 * One login's quota, for the quota store's per-account cadence. `rateLimited`
 * is the 429 that backs off every poll on this endpoint (KTD10).
 */
export async function fetchCodexAccountForSelection(
	selection: string | null,
): Promise<{ account: UsageAccount | null; rateLimited: boolean }> {
	const homes = await discoverCodexHomes();
	const defaultHome = homes[0]?.home ?? null;
	const home =
		selection === null
			? homes[0]
			: homes.find((candidate) => candidate.home === selection);
	if (!home) return { account: null, rateLimited: false };
	let rateLimited = false;
	const accounts = await fetchCodexAccountForHome(
		home,
		home.home === defaultHome,
		(status) => {
			rateLimited = status === 429;
		},
	);
	return { account: accounts[0] ?? null, rateLimited };
}

function codexAccountBase(home: CodexHome, isDefaultHome: boolean) {
	const codexHome = home.home;
	return {
		agent: "codex" as const,
		credentialKind: home.credentialKind,
		accountKey: join(codexHome, "auth.json"),
		sourceLabel: codexHome.replace(homedir(), "~"),
		extraUsage: null,
		selection: isDefaultHome ? null : codexHome,
		// Decorated per-query from host settings; the quota cache outlives it.
		isDefault: false,
		fetchedAt: new Date(),
	};
}

/**
 * API billing has no quota endpoint, and the auth.json holds the raw key —
 * the card is built from the marker alone.
 */
function codexApiKeyAccount(
	home: CodexHome,
	isDefaultHome: boolean,
): UsageAccount {
	return {
		...codexAccountBase(home, isDefaultHome),
		email: null,
		plan: null,
		status: "ok",
		statusDetail:
			"Billed per token through the OpenAI Platform — no quota windows.",
		windows: [],
		creditsBalance: null,
	};
}

async function fetchCodexAccountForHome(
	home: CodexHome,
	isDefaultHome: boolean,
	/** The usage endpoint's HTTP status, so a poller can see a 429. */
	onHttpStatus?: (status: number) => void,
): Promise<UsageAccount[]> {
	const codexHome = home.home;
	const authPath = join(codexHome, "auth.json");
	const base = codexAccountBase(home, isDefaultHome);

	if (home.credentialKind === "api_key") {
		return [codexApiKeyAccount(home, isDefaultHome)];
	}

	let auth: CodexAuthFile;
	try {
		auth = JSON.parse(await readFile(authPath, "utf-8"));
	} catch {
		return [];
	}
	const accessToken = auth.tokens?.access_token;
	if (!accessToken) return [];

	try {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${accessToken}`,
		};
		if (auth.tokens?.account_id) {
			headers["chatgpt-account-id"] = auth.tokens.account_id;
		}
		const response = await fetch(CODEX_USAGE_URL, {
			headers,
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		onHttpStatus?.(response.status);

		if (response.status === 401 || response.status === 403) {
			return [
				{
					...base,
					email: null,
					plan: null,
					status: "token_expired",
					statusDetail: "Codex token expired — run `codex` to refresh it.",
					windows: [],
					creditsBalance: null,
				},
			];
		}
		if (!response.ok) {
			return [
				{
					...base,
					email: null,
					plan: null,
					status: "unavailable",
					statusDetail: `Usage endpoint returned ${response.status}.`,
					windows: [],
					creditsBalance: null,
				},
			];
		}

		const usage = (await response.json()) as CodexUsageResponse;
		const windows = mapWindows(usage);
		const balance = Number.parseFloat(usage.credits?.balance ?? "");

		return [
			{
				...base,
				email: usage.email ?? null,
				plan: usage.plan_type ?? null,
				status: windows.length > 0 ? "ok" : "unavailable",
				statusDetail:
					windows.length > 0 ? null : "No quota data returned for this plan.",
				windows,
				creditsBalance: Number.isFinite(balance) ? balance : null,
			},
		];
	} catch (error) {
		return [
			{
				...base,
				email: null,
				plan: null,
				status: "unavailable",
				statusDetail:
					error instanceof Error ? error.message : "Failed to fetch usage.",
				windows: [],
				creditsBalance: null,
			},
		];
	}
}
