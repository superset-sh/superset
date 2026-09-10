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
	// Dedupe by account email — one login used from several homes is one
	// account; keep the first (default home wins).
	const seen = new Set<string>();
	return accounts.flat().filter((account) => {
		const key = account.email ?? account.accountKey;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

async function fetchCodexAccountForHome(
	home: CodexHome,
	isDefaultHome: boolean,
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
