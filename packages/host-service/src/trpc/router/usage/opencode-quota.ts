/**
 * OpenCode quota: the Anthropic and OpenAI subscriptions OpenCode is signed
 * into, read from `<data>/opencode/auth.json`. Both logins use the same OAuth
 * clients as Claude Code and Codex, so the same quota endpoints answer.
 * Read-only: a lapsed token is reported, never refreshed — OpenCode renews it
 * on its next request to that provider.
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fetchClaudeSubscriptionQuota } from "./claude";
import { fetchCodexSubscriptionQuota } from "./codex";
import { opencodeDataDir } from "./history/opencode";
import type { UsageAccount, UsageAccountCredentialKind } from "./types";

export type OpencodeQuotaProvider = "anthropic" | "openai";

const PROVIDER_LABELS: Record<OpencodeQuotaProvider, string> = {
	anthropic: "Anthropic",
	openai: "OpenAI",
};

const API_BILLING_DETAIL: Record<OpencodeQuotaProvider, string> = {
	anthropic:
		"Billed per token through the Anthropic Console — no quota windows.",
	openai: "Billed per token through the OpenAI Platform — no quota windows.",
};

export const OPENCODE_STALE_TOKEN_DETAIL =
	"Refreshes when OpenCode next calls this provider.";
export const OPENCODE_EXPIRED_TOKEN_DETAIL =
	"Sign-in expired — run `opencode auth login`.";

export interface OpencodeLogin {
	provider: OpencodeQuotaProvider;
	credentialKind: UsageAccountCredentialKind;
	accessToken: string | null;
	accountId: string | null;
	lapsed: "live" | "token_stale" | "token_expired";
}

interface OpencodeAuthEntry {
	type?: string;
	access?: string;
	refresh?: string;
	expires?: number;
	accountId?: string;
	key?: string;
}

/**
 * The provider entries with a quota story: OAuth logins carry a subscription,
 * `type: "api"` entries are pay-per-token keys (never opened). Everything else
 * (other providers, well-known env keys) is ignored.
 */
export function parseOpencodeLogins(
	raw: string,
	now = Date.now(),
): OpencodeLogin[] {
	let parsed: Record<string, OpencodeAuthEntry>;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!parsed || typeof parsed !== "object") return [];
	const logins: OpencodeLogin[] = [];
	for (const provider of ["anthropic", "openai"] as const) {
		const entry = parsed[provider];
		if (!entry || typeof entry !== "object") continue;
		if (entry.type === "api") {
			logins.push({
				provider,
				credentialKind: "api_key",
				accessToken: null,
				accountId: null,
				lapsed: "live",
			});
			continue;
		}
		if (entry.type !== "oauth" || typeof entry.access !== "string") continue;
		const expired = typeof entry.expires === "number" && entry.expires <= now;
		const renewable =
			typeof entry.refresh === "string" && entry.refresh.length > 0;
		logins.push({
			provider,
			credentialKind: "subscription",
			accessToken: entry.access,
			accountId: typeof entry.accountId === "string" ? entry.accountId : null,
			lapsed: !expired ? "live" : renewable ? "token_stale" : "token_expired",
		});
	}
	return logins;
}

export function opencodeAuthPath(dataDir: string = opencodeDataDir()): string {
	return join(dataDir, "auth.json");
}

async function fetchOpencodeAccount(
	login: OpencodeLogin,
	authPath: string,
): Promise<UsageAccount> {
	const dataDir = join(authPath, "..").replace(homedir(), "~");
	const base = {
		agent: "opencode" as const,
		credentialKind: login.credentialKind,
		accountKey: `${authPath}#${login.provider}`,
		sourceLabel: `${dataDir} · ${PROVIDER_LABELS[login.provider]}`,
		email: null,
		plan: null,
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		// OpenCode has one login per provider; nothing to switch between.
		selection: null,
		isDefault: false,
		fetchedAt: new Date(),
	};

	if (login.credentialKind === "api_key") {
		return {
			...base,
			status: "ok",
			statusDetail: API_BILLING_DETAIL[login.provider],
		};
	}
	if (login.lapsed !== "live" || !login.accessToken) {
		return {
			...base,
			status: login.lapsed === "token_stale" ? "token_stale" : "token_expired",
			statusDetail:
				login.lapsed === "token_stale"
					? OPENCODE_STALE_TOKEN_DETAIL
					: OPENCODE_EXPIRED_TOKEN_DETAIL,
		};
	}

	if (login.provider === "anthropic") {
		const quota = await fetchClaudeSubscriptionQuota(login.accessToken);
		return {
			...base,
			...quota,
			statusDetail:
				quota.status === "token_expired"
					? OPENCODE_EXPIRED_TOKEN_DETAIL
					: quota.statusDetail,
		};
	}
	const quota = await fetchCodexSubscriptionQuota(
		login.accessToken,
		login.accountId ?? undefined,
	);
	return {
		...base,
		...quota,
		statusDetail:
			quota.status === "token_expired"
				? OPENCODE_EXPIRED_TOKEN_DETAIL
				: quota.statusDetail,
	};
}

export async function fetchOpencodeAccounts(
	authPath: string = opencodeAuthPath(),
): Promise<UsageAccount[]> {
	let raw: string;
	try {
		raw = await readFile(authPath, "utf-8");
	} catch {
		return [];
	}
	return Promise.all(
		parseOpencodeLogins(raw).map((login) =>
			fetchOpencodeAccount(login, authPath),
		),
	);
}
