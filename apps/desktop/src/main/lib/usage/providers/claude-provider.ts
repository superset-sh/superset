import { homedir } from "node:os";
import { join } from "node:path";
import { parseClaudeLogs } from "../log-parsers/claude-log-parser";
import type { ProviderSnapshot, RateLimitWindow } from "../usage-snapshot";
import { emptySnapshot, ProviderCollector } from "./base-provider";
import { readJsonFile, readKeychainSecret } from "./credentials";
import { buildWindow } from "./window-pace";

const CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");
const MODELS_ENDPOINT = "https://api.anthropic.com/v1/models?limit=1";
const ANTHROPIC_VERSION = "2023-06-01";

interface ClaudeCredentials {
	claudeAiOauth?: { accessToken?: string };
	access_token?: string;
	accessToken?: string;
}

async function resolveToken(): Promise<string | null> {
	const creds = await readJsonFile<ClaudeCredentials>(CREDENTIALS_PATH);
	const fromFile =
		creds?.claudeAiOauth?.accessToken ??
		creds?.access_token ??
		creds?.accessToken ??
		null;
	if (fromFile) return fromFile;
	return readKeychainSecret("claude");
}

function pctFromHeaders(
	headers: Headers,
	limitKey: string,
	remainingKey: string,
): number | null {
	const limit = Number.parseFloat(headers.get(limitKey) ?? "");
	const remaining = Number.parseFloat(headers.get(remainingKey) ?? "");
	if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(remaining)) {
		return null;
	}
	return ((limit - remaining) / limit) * 100;
}

function resetFromHeader(headers: Headers, key: string): Date | null {
	const raw = headers.get(key);
	if (!raw) return null;
	const date = new Date(raw);
	return Number.isNaN(date.getTime()) ? null : date;
}

function windowsFromHeaders(headers: Headers): RateLimitWindow[] {
	const windows: RateLimitWindow[] = [];

	const requestsPct = pctFromHeaders(
		headers,
		"anthropic-ratelimit-requests-limit",
		"anthropic-ratelimit-requests-remaining",
	);
	if (requestsPct !== null) {
		windows.push(
			buildWindow({
				label: "Requests",
				usedPct: requestsPct,
				resetAt: resetFromHeader(headers, "anthropic-ratelimit-requests-reset"),
			}),
		);
	}

	const tokensPct = pctFromHeaders(
		headers,
		"anthropic-ratelimit-tokens-limit",
		"anthropic-ratelimit-tokens-remaining",
	);
	if (tokensPct !== null) {
		windows.push(
			buildWindow({
				label: "Tokens",
				usedPct: tokensPct,
				resetAt: resetFromHeader(headers, "anthropic-ratelimit-tokens-reset"),
			}),
		);
	}

	return windows;
}

export class ClaudeProvider extends ProviderCollector {
	readonly providerId = "claude" as const;

	protected async fetchSnapshot(): Promise<ProviderSnapshot> {
		const token = await resolveToken();
		const cost = await parseClaudeLogs();

		if (!token) {
			return emptySnapshot(this.providerId, "no-credentials", { cost });
		}

		const response = await this.fetchWithTimeout(MODELS_ENDPOINT, {
			headers: {
				authorization: `Bearer ${token}`,
				"anthropic-version": ANTHROPIC_VERSION,
			},
		});

		// A subscription (Max/Pro) OAuth token frequently cannot call /v1/models,
		// so a 401/403 here is not proof the session is dead — it just means we
		// can't harvest rate-limit headers. Keep showing locally-estimated cost
		// with no windows rather than a misleading "session expired" error.
		const windows = response.ok ? windowsFromHeaders(response.headers) : [];

		return emptySnapshot(this.providerId, "ok", { cost, windows });
	}
}
