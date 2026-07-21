import { homedir } from "node:os";
import { join } from "node:path";
import { parseClaudeLogs } from "../log-parsers/claude-log-parser";
import type { ProviderSnapshot, RateLimitWindow } from "../usage-snapshot";
import { emptySnapshot, ProviderCollector } from "./base-provider";
import { readJsonFile, readKeychainSecret } from "./credentials";
import { buildWindow } from "./window-pace";

const CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");
// Claude Code stores the live (refreshed) OAuth token in the macOS Keychain
// under this service; the on-disk file is often a stale/revoked copy.
const KEYCHAIN_SERVICE = "Claude Code-credentials";
const MESSAGES_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// The subscription rate-limit windows only ride on /v1/messages responses when
// the request is made with an OAuth (subscription) token + this beta header.
const OAUTH_BETA = "oauth-2025-04-20";
const PROBE_MODEL = "claude-haiku-4-5-20251001";

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface ClaudeOAuth {
	accessToken?: string;
	subscriptionType?: string;
	account?: { email_address?: string; email?: string };
}

interface ClaudeCredentials {
	claudeAiOauth?: ClaudeOAuth;
	access_token?: string;
	accessToken?: string;
}

async function readCredentials(): Promise<ClaudeCredentials | null> {
	const raw = await readKeychainSecret(KEYCHAIN_SERVICE);
	if (raw) {
		try {
			return JSON.parse(raw) as ClaudeCredentials;
		} catch {
			// Fall through to the on-disk file.
		}
	}
	return readJsonFile<ClaudeCredentials>(CREDENTIALS_PATH);
}

function resolveToken(creds: ClaudeCredentials): string | null {
	return (
		creds.claudeAiOauth?.accessToken ??
		creds.access_token ??
		creds.accessToken ??
		null
	);
}

function resetFromHeader(headers: Headers, key: string): Date | null {
	const raw = headers.get(key);
	if (!raw) return null;
	const seconds = Number.parseInt(raw, 10);
	if (!Number.isFinite(seconds)) return null;
	return new Date(seconds * 1000);
}

function unifiedWindow(
	headers: Headers,
	prefix: string,
	label: string,
	windowMs: number,
): RateLimitWindow | null {
	const utilization = Number.parseFloat(
		headers.get(`anthropic-ratelimit-unified-${prefix}-utilization`) ?? "",
	);
	if (!Number.isFinite(utilization)) return null;
	return buildWindow({
		label,
		usedPct: utilization * 100,
		resetAt: resetFromHeader(
			headers,
			`anthropic-ratelimit-unified-${prefix}-reset`,
		),
		windowMs,
	});
}

function windowsFromHeaders(headers: Headers): RateLimitWindow[] {
	const windows: RateLimitWindow[] = [];
	const session = unifiedWindow(headers, "5h", "5-hour session", FIVE_HOURS_MS);
	if (session) windows.push(session);
	const weekly = unifiedWindow(
		headers,
		"7d",
		"Weekly (all models)",
		SEVEN_DAYS_MS,
	);
	if (weekly) windows.push(weekly);
	return windows;
}

export class ClaudeProvider extends ProviderCollector {
	readonly providerId = "claude" as const;

	protected async fetchSnapshot(): Promise<ProviderSnapshot> {
		const creds = await readCredentials();
		const cost = await parseClaudeLogs();

		const token = creds ? resolveToken(creds) : null;
		if (!token) {
			return emptySnapshot(this.providerId, "no-credentials", { cost });
		}

		const oauth = creds?.claudeAiOauth;
		const email =
			oauth?.account?.email_address ?? oauth?.account?.email ?? null;
		const planLabel = oauth?.subscriptionType
			? oauth.subscriptionType.toUpperCase()
			: null;

		// A minimal 1-token request is the cheapest way to harvest the unified
		// rate-limit headers; it consumes one request against the 5h window.
		const response = await this.fetchWithTimeout(MESSAGES_ENDPOINT, {
			method: "POST",
			headers: {
				authorization: `Bearer ${token}`,
				"anthropic-version": ANTHROPIC_VERSION,
				"anthropic-beta": OAUTH_BETA,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				model: PROBE_MODEL,
				max_tokens: 1,
				messages: [{ role: "user", content: "hi" }],
			}),
		});

		// We only read headers, never the body — cancel it so undici releases the
		// TCP socket instead of leaking one on every 5-minute probe.
		await response.body?.cancel().catch(() => undefined);

		if (response.status === 401 || response.status === 403) {
			return emptySnapshot(this.providerId, "auth-error", {
				cost,
				email,
				planLabel,
				errorMessage: "Session expired — re-authenticate the Claude CLI.",
			});
		}

		if (!response.ok) {
			// A transient non-auth failure (e.g. 500/503) must not clear the shown
			// windows or report the provider as healthy.
			return emptySnapshot(this.providerId, "auth-error", {
				cost,
				email,
				planLabel,
				errorMessage: `Anthropic API returned ${response.status} — usage data unavailable.`,
			});
		}

		return emptySnapshot(this.providerId, "ok", {
			cost,
			email,
			planLabel,
			windows: windowsFromHeaders(response.headers),
		});
	}
}
