import type {
	ProviderUsage,
	UsageWindow,
} from "lib/trpc/routers/provider-usage.schema";
import { z } from "zod";
import {
	type CodexRateLimitsReadResult,
	readCodexRateLimits,
} from "./codex-app-server";

const rateLimitWindowSchema = z
	.object({
		usedPercent: z.number().finite(),
		windowDurationMins: z.number().int().positive().nullish(),
		resetsAt: z.number().finite().positive().nullish(),
	})
	.nullish();

const rateLimitSnapshotSchema = z.object({
	primary: z.unknown().optional(),
	secondary: z.unknown().optional(),
	planType: z.string().nullish(),
});

const rateLimitsResponseSchema = z.object({
	rateLimits: rateLimitSnapshotSchema,
	rateLimitsByLimitId: z.record(z.string(), rateLimitSnapshotSchema).nullish(),
});

interface ParsedCodexUsage {
	accountLabel: string | null;
	windows: UsageWindow[];
}

interface CodexUsageDependencies {
	readRateLimits: () => Promise<CodexRateLimitsReadResult>;
}

function clampPercent(value: number): number {
	return Math.min(100, Math.max(0, value));
}

function formatWindowLabel(minutes: number | null | undefined): string {
	if (!minutes) return "Usage";
	if (minutes >= 7 * 24 * 60) return "Weekly";
	if (minutes >= 60) return `${Math.round(minutes / 60)} hour`;
	return `${Math.round(minutes)} min`;
}

function mapWindow(
	id: "primary" | "secondary",
	value: unknown,
): UsageWindow | null {
	const parsed = rateLimitWindowSchema.safeParse(value);
	if (!parsed.success || !parsed.data) return null;
	const bucket = parsed.data;
	const usedPercent = clampPercent(bucket.usedPercent);
	return {
		id,
		label: formatWindowLabel(bucket.windowDurationMins),
		usedPercent,
		remainingPercent: 100 - usedPercent,
		resetAt: bucket.resetsAt ? bucket.resetsAt * 1_000 : null,
		windowSeconds: bucket.windowDurationMins
			? bucket.windowDurationMins * 60
			: null,
	};
}

export function parseCodexUsageResponse(value: unknown): ParsedCodexUsage {
	const parsed = rateLimitsResponseSchema.safeParse(value);
	if (!parsed.success) return { accountLabel: null, windows: [] };
	const snapshot =
		parsed.data.rateLimitsByLimitId?.codex ?? parsed.data.rateLimits;
	return {
		accountLabel: snapshot.planType?.toUpperCase() ?? null,
		windows: [
			mapWindow("primary", snapshot.primary),
			mapWindow("secondary", snapshot.secondary),
		].filter((window): window is UsageWindow => window !== null),
	};
}

const defaultDependencies: CodexUsageDependencies = {
	readRateLimits: readCodexRateLimits,
};

export async function collectCodexUsage(
	dependencies: CodexUsageDependencies = defaultDependencies,
): Promise<ProviderUsage> {
	const result = await dependencies.readRateLimits();
	if (result.status === "not-configured") {
		return {
			providerId: "codex",
			providerName: "Codex",
			status: "not-configured",
			accountLabel: null,
			windows: [],
			errorMessage: null,
		};
	}

	if (result.status === "ok") {
		const parsed = parseCodexUsageResponse(result.value);
		if (parsed.windows.length > 0) {
			return {
				providerId: "codex",
				providerName: "Codex",
				status: "ok",
				accountLabel: parsed.accountLabel,
				windows: parsed.windows,
				errorMessage: null,
			};
		}
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
