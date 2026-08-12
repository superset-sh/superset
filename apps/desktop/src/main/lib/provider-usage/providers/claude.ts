import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	getCredentialsFromAnySource,
	type ClaudeCredentials as SupersetClaudeCredentials,
} from "@superset/chat-legacy/server/desktop";
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
	resets_at: z.union([z.string(), z.number()]).nullish(),
});

const limitBucketSchema = z.object({
	kind: z.string().min(1),
	group: z.string().nullish(),
	percent: z.number().finite(),
	resets_at: z.union([z.string(), z.number()]).nullish(),
	scope: z
		.object({
			model: z
				.object({
					display_name: z.string().nullish(),
				})
				.nullish(),
		})
		.nullish(),
});

const credentialsSchema = z.object({
	claudeAiOauth: z
		.object({
			accessToken: z.string().min(1),
			subscriptionType: z.string().nullish(),
			expiresAt: z.number().finite().nullish(),
		})
		.nullish(),
});

export interface ClaudeCredentials {
	accessToken: string;
	accountLabel: string | null;
	expiresAt: number | null;
}

interface ClaudeCredentialSources {
	platform: NodeJS.Platform;
	now: () => number;
	readKeychain: () => Promise<ClaudeCredentials | null>;
	readSupersetCredentials: () => Promise<SupersetClaudeCredentials | null>;
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

function parseResetAt(
	value: string | number | null | undefined,
): number | null {
	if (!value) return null;
	if (typeof value === "number") {
		const timestamp = value < 1_000_000_000_000 ? value * 1_000 : value;
		return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
	}
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeLimitId(value: string): string {
	return value
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "-")
		.replaceAll(/^-+|-+$/g, "");
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

	const limits = Array.isArray(record.limits) ? record.limits : [];
	for (const value of limits) {
		const limit = limitBucketSchema.safeParse(value);
		if (!limit.success) continue;
		if (limit.data.kind === "session" || limit.data.kind === "weekly_all") {
			continue;
		}
		const modelName = limit.data.scope?.model?.display_name ?? limit.data.kind;
		const isWeekly = limit.data.group === "weekly";
		const usedPercent = clampPercent(limit.data.percent);
		windows.push({
			id: `limit:${limit.data.kind}:${normalizeLimitId(modelName)}`,
			label: `${modelName}${isWeekly ? " wk" : ""}`.trim(),
			usedPercent,
			remainingPercent: 100 - usedPercent,
			resetAt: parseResetAt(limit.data.resets_at),
			windowSeconds: isWeekly ? 7 * 24 * 60 * 60 : 5 * 60 * 60,
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
		expiresAt: oauth.expiresAt ?? null,
	};
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
	return async () => {
		const keychainCredential =
			sources.platform === "darwin"
				? await sources.readKeychain().catch(() => null)
				: null;
		if (
			keychainCredential &&
			(keychainCredential.expiresAt === null ||
				keychainCredential.expiresAt > sources.now())
		) {
			return keychainCredential;
		}

		const resolved = await sources.readSupersetCredentials().catch(() => null);
		if (
			!resolved ||
			resolved.kind !== "oauth" ||
			(typeof resolved.expiresAt === "number" &&
				resolved.expiresAt <= sources.now())
		) {
			return null;
		}
		return {
			accessToken: resolved.apiKey,
			accountLabel: null,
			expiresAt: resolved.expiresAt ?? null,
		};
	};
}

const readClaudeCredentials = createClaudeCredentialReader({
	platform: process.platform,
	now: Date.now,
	readKeychain: readKeychainCredentials,
	readSupersetCredentials: getCredentialsFromAnySource,
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
			activeAccountId: null,
			accounts: [],
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
				activeAccountId: "claude:active",
				accounts: [
					{
						id: "claude:active",
						providerId: "claude",
						profileName: "active",
						accountLabel: credentials.accountLabel,
						planLabel: credentials.accountLabel,
						isActive: true,
						status: "ok",
						statusMessage: "live",
						windows,
					},
				],
				windows,
				errorMessage: null,
			};
		}
		console.warn("[provider-usage] Claude usage response was unavailable:", {
			status: response.status,
			hasWindows: windows.length > 0,
		});
	} catch (error) {
		console.warn("[provider-usage] Failed to collect Claude usage:", error);
		// The compact meter reports a safe provider state without leaking details.
	}

	return {
		providerId: "claude",
		providerName: "Claude",
		status: "unavailable",
		accountLabel: credentials.accountLabel,
		activeAccountId: "claude:active",
		accounts: [
			{
				id: "claude:active",
				providerId: "claude",
				profileName: "active",
				accountLabel: credentials.accountLabel,
				planLabel: credentials.accountLabel,
				isActive: true,
				status: "error",
				statusMessage: "Claude usage is temporarily unavailable.",
				windows: [],
			},
		],
		windows: [],
		errorMessage: "Claude usage is temporarily unavailable.",
	};
}
