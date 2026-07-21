import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
	ProviderUsage,
	UsageWindow,
} from "lib/trpc/routers/provider-usage.schema";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_OAUTH_BETA = "oauth-2025-04-20";
const CLAUDE_KEYCHAIN_SERVICE = "Claude Code-credentials";

const usageBucketSchema = z.object({
	utilization: z.number().finite(),
	resets_at: z.string().nullish(),
});

const credentialsSchema = z.object({
	claudeAiOauth: z
		.object({
			accessToken: z.string().min(1),
			subscriptionType: z.string().nullish(),
		})
		.nullish(),
});

export interface ClaudeCredentials {
	accessToken: string;
	accountLabel: string | null;
}

interface ClaudeCredentialSources {
	platform: NodeJS.Platform;
	readKeychain: () => Promise<ClaudeCredentials | null>;
	readFile: () => Promise<ClaudeCredentials | null>;
}

interface ClaudeUsageDependencies {
	readCredentials: () => Promise<ClaudeCredentials | null>;
	fetchUsage: (url: string, init: RequestInit) => Promise<Response>;
}

const CLAUDE_WINDOWS = [
	{
		id: "five_hour",
		label: "5 hour",
		windowSeconds: 5 * 60 * 60,
	},
	{
		id: "seven_day",
		label: "Weekly",
		windowSeconds: 7 * 24 * 60 * 60,
	},
] as const;

function clampPercent(value: number): number {
	return Math.min(100, Math.max(0, value));
}

function parseResetAt(value: string | null | undefined): number | null {
	if (!value) return null;
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : null;
}

export function parseClaudeUsageResponse(value: unknown): UsageWindow[] {
	if (!value || typeof value !== "object") return [];

	const record = value as Record<string, unknown>;
	const windows: UsageWindow[] = [];
	for (const knownWindow of CLAUDE_WINDOWS) {
		const bucket = usageBucketSchema.safeParse(record[knownWindow.id]);
		if (!bucket.success) continue;
		const usedPercent = clampPercent(bucket.data.utilization);
		windows.push({
			...knownWindow,
			usedPercent,
			remainingPercent: 100 - usedPercent,
			resetAt: parseResetAt(bucket.data.resets_at),
		});
	}
	return windows;
}

function parseCredentials(value: unknown): ClaudeCredentials | null {
	const parsed = credentialsSchema.safeParse(value);
	const oauth = parsed.success ? parsed.data.claudeAiOauth : null;
	if (!oauth) return null;
	return {
		accessToken: oauth.accessToken,
		accountLabel: oauth.subscriptionType
			? oauth.subscriptionType.toUpperCase()
			: null,
	};
}

async function readCredentialFile(): Promise<ClaudeCredentials | null> {
	try {
		const raw = await fs.readFile(
			path.join(os.homedir(), ".claude", ".credentials.json"),
			"utf8",
		);
		return parseCredentials(JSON.parse(raw));
	} catch {
		return null;
	}
}

async function readKeychainCredentials(): Promise<ClaudeCredentials | null> {
	if (process.platform !== "darwin") return null;
	try {
		const { stdout } = await execFileAsync(
			"security",
			["find-generic-password", "-s", CLAUDE_KEYCHAIN_SERVICE, "-w"],
			{ timeout: 3_000 },
		);
		return parseCredentials(JSON.parse(stdout.trim()));
	} catch {
		return null;
	}
}

export function createClaudeCredentialReader(
	sources: ClaudeCredentialSources,
): () => Promise<ClaudeCredentials | null> {
	let keychainResult: Promise<ClaudeCredentials | null> | null = null;
	return async () => {
		if (sources.platform !== "darwin") return sources.readFile();
		keychainResult ??= sources.readKeychain().catch(() => null);
		return (await keychainResult) ?? sources.readFile();
	};
}

const readClaudeCredentials = createClaudeCredentialReader({
	platform: process.platform,
	readKeychain: readKeychainCredentials,
	readFile: readCredentialFile,
});

const defaultDependencies: ClaudeUsageDependencies = {
	readCredentials: readClaudeCredentials,
	fetchUsage: (url, init) => fetch(url, init),
};

export async function collectClaudeUsage(
	dependencies: ClaudeUsageDependencies = defaultDependencies,
): Promise<ProviderUsage> {
	const credentials = await dependencies.readCredentials();
	if (!credentials) {
		return {
			providerId: "claude",
			providerName: "Claude",
			status: "not-configured",
			accountLabel: null,
			windows: [],
			errorMessage: null,
		};
	}

	try {
		const response = await dependencies.fetchUsage(CLAUDE_USAGE_URL, {
			method: "GET",
			redirect: "error",
			headers: {
				Authorization: `Bearer ${credentials.accessToken}`,
				"anthropic-beta": CLAUDE_OAUTH_BETA,
			},
			signal: AbortSignal.timeout(10_000),
		});
		const value: unknown = response.ok
			? await response.json().catch(() => null)
			: null;
		const windows = parseClaudeUsageResponse(value);
		if (response.ok && windows.length > 0) {
			return {
				providerId: "claude",
				providerName: "Claude",
				status: "ok",
				accountLabel: credentials.accountLabel,
				windows,
				errorMessage: null,
			};
		}
	} catch {
		// The compact meter reports a safe provider state without leaking details.
	}

	return {
		providerId: "claude",
		providerName: "Claude",
		status: "unavailable",
		accountLabel: credentials.accountLabel,
		windows: [],
		errorMessage: "Claude usage is temporarily unavailable.",
	};
}
