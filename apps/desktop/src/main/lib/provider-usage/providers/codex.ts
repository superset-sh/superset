import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
	ProviderUsage,
	UsageWindow,
} from "lib/trpc/routers/provider-usage.schema";
import { z } from "zod";

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

const rateLimitWindowSchema = z
	.object({
		used_percent: z.number().finite(),
		limit_window_seconds: z.number().int().positive().nullish(),
		reset_at: z.number().finite().positive().nullish(),
	})
	.nullish();

const credentialsSchema = z.object({
	tokens: z
		.object({
			access_token: z.string().min(1),
			account_id: z.string().nullish(),
		})
		.nullish(),
});

const accountSchema = z.object({
	email: z.string().nullish(),
	plan_type: z.string().nullish(),
});

interface CodexCredentials {
	accessToken: string;
	accountId: string | null;
}

interface CodexUsageDependencies {
	readCredentials: () => Promise<CodexCredentials | null>;
	fetchUsage: (url: string, init: RequestInit) => Promise<Response>;
}

function clampPercent(value: number): number {
	return Math.min(100, Math.max(0, value));
}

function formatWindowLabel(seconds: number | null | undefined): string {
	if (!seconds) return "Usage";
	if (seconds >= 7 * 24 * 60 * 60) return "Weekly";
	if (seconds >= 60 * 60) return `${Math.round(seconds / 3_600)} hour`;
	return `${Math.round(seconds / 60)} min`;
}

function mapWindow(
	id: "primary" | "secondary",
	value: unknown,
): UsageWindow | null {
	const parsed = rateLimitWindowSchema.safeParse(value);
	if (!parsed.success || !parsed.data) return null;
	const bucket = parsed.data;
	const usedPercent = clampPercent(bucket.used_percent);
	return {
		id,
		label: formatWindowLabel(bucket.limit_window_seconds),
		usedPercent,
		remainingPercent: 100 - usedPercent,
		resetAt: bucket.reset_at ? bucket.reset_at * 1_000 : null,
		windowSeconds: bucket.limit_window_seconds ?? null,
	};
}

export function parseCodexUsageResponse(value: unknown): UsageWindow[] {
	if (!value || typeof value !== "object") return [];
	const rateLimit = (value as { rate_limit?: unknown }).rate_limit;
	if (!rateLimit || typeof rateLimit !== "object") return [];
	const windows = rateLimit as Record<string, unknown>;
	return [
		mapWindow("primary", windows.primary_window),
		mapWindow("secondary", windows.secondary_window),
	].filter((window): window is UsageWindow => window !== null);
}

function parseCredentials(value: unknown): CodexCredentials | null {
	const parsed = credentialsSchema.safeParse(value);
	const tokens = parsed.success ? parsed.data.tokens : null;
	if (!tokens) return null;
	return {
		accessToken: tokens.access_token,
		accountId: tokens.account_id ?? null,
	};
}

async function readCodexCredentials(): Promise<CodexCredentials | null> {
	try {
		const raw = await fs.readFile(
			path.join(os.homedir(), ".codex", "auth.json"),
			"utf8",
		);
		return parseCredentials(JSON.parse(raw));
	} catch {
		return null;
	}
}

const defaultDependencies: CodexUsageDependencies = {
	readCredentials: readCodexCredentials,
	fetchUsage: (url, init) => fetch(url, init),
};

export async function collectCodexUsage(
	dependencies: CodexUsageDependencies = defaultDependencies,
): Promise<ProviderUsage> {
	const credentials = await dependencies.readCredentials();
	if (!credentials) {
		return {
			providerId: "codex",
			providerName: "Codex",
			status: "not-configured",
			accountLabel: null,
			windows: [],
			errorMessage: null,
		};
	}

	try {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${credentials.accessToken}`,
		};
		if (credentials.accountId) {
			headers["chatgpt-account-id"] = credentials.accountId;
		}
		const response = await dependencies.fetchUsage(CODEX_USAGE_URL, {
			method: "GET",
			redirect: "error",
			headers,
			signal: AbortSignal.timeout(10_000),
		});
		const value: unknown = response.ok
			? await response.json().catch(() => null)
			: null;
		const windows = parseCodexUsageResponse(value);
		if (response.ok && windows.length > 0) {
			const account = accountSchema.safeParse(value);
			return {
				providerId: "codex",
				providerName: "Codex",
				status: "ok",
				accountLabel: account.success
					? (account.data.email ?? account.data.plan_type ?? null)
					: null,
				windows,
				errorMessage: null,
			};
		}
	} catch {
		// The compact meter reports a safe provider state without leaking details.
	}

	return {
		providerId: "codex",
		providerName: "Codex",
		status: "unavailable",
		accountLabel: null,
		windows: [],
		errorMessage: "Codex usage is temporarily unavailable.",
	};
}
