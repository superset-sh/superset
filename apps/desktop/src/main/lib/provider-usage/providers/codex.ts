import type {
	ProviderUsage,
	ProviderUsageAccount,
	UsageWindow,
} from "lib/trpc/routers/provider-usage.schema";
import { z } from "zod";
import {
	type CodexRateLimitsReadResult,
	readCodexRateLimits,
} from "./codex-app-server";
import { type CodexIdentity, codexProfileStore } from "./codex-profiles";

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
	planLabel: string | null;
	windows: UsageWindow[];
}

interface CodexUsageDependencies {
	readRateLimits?: () => Promise<CodexRateLimitsReadResult>;
	profileStore?: typeof codexProfileStore;
	now?: () => number;
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
	if (!parsed.success)
		return { accountLabel: null, planLabel: null, windows: [] };
	const snapshot =
		parsed.data.rateLimitsByLimitId?.codex ?? parsed.data.rateLimits;
	const planLabel = snapshot.planType?.toUpperCase() ?? null;
	return {
		accountLabel: planLabel,
		planLabel,
		windows: [
			mapWindow("primary", snapshot.primary),
			mapWindow("secondary", snapshot.secondary),
		].filter((window): window is UsageWindow => window !== null),
	};
}

const defaultDependencies = {
	readRateLimits: readCodexRateLimits,
	profileStore: codexProfileStore,
	now: Date.now,
} satisfies Required<CodexUsageDependencies>;

function statusFromAccounts(
	accounts: ProviderUsageAccount[],
): ProviderUsage["status"] {
	if (accounts.some((account) => account.status === "ok")) return "ok";
	if (accounts.length > 0) return "unavailable";
	return "not-configured";
}

function currentAccountRow(
	identity: CodexIdentity,
	windows: UsageWindow[],
	planLabel: string | null,
): ProviderUsageAccount {
	return {
		id: `codex:${identity.accountId}`,
		providerId: "codex",
		profileName: identity.email ?? "current",
		accountLabel: identity.email,
		planLabel: planLabel ?? identity.plan,
		isActive: true,
		status: windows.length > 0 ? "ok" : "no-data",
		statusMessage: windows.length > 0 ? "live" : "No reading yet",
		windows,
	};
}

function activeAccountFrom(
	accounts: ProviderUsageAccount[],
): ProviderUsageAccount | null {
	return accounts.find((account) => account.isActive) ?? null;
}

function sameCodexIdentity(
	first: CodexIdentity | null,
	second: CodexIdentity | null,
): boolean {
	return Boolean(first && second && first.accountId === second.accountId);
}

async function rowsWithCurrentActive(
	dependencies: Required<CodexUsageDependencies>,
	activeIdentity: CodexIdentity | null,
	activeWindows: UsageWindow[],
	activePlanLabel: string | null,
): Promise<ProviderUsageAccount[]> {
	const accounts = await dependencies.profileStore.accountRows();
	if (!activeIdentity) return accounts;
	const activeId = `codex:${activeIdentity.accountId}`;
	if (accounts.some((account) => account.id === activeId)) {
		return accounts.map((account) =>
			account.id === activeId
				? {
						...account,
						isActive: true,
						status: activeWindows.length > 0 ? "ok" : account.status,
						statusMessage:
							activeWindows.length > 0 ? "live" : account.statusMessage,
						planLabel: activePlanLabel ?? account.planLabel,
						windows: activeWindows.length > 0 ? activeWindows : account.windows,
					}
				: { ...account, isActive: false },
		);
	}
	return [
		currentAccountRow(activeIdentity, activeWindows, activePlanLabel),
		...accounts.map((account) => ({ ...account, isActive: false })),
	];
}

export async function collectCodexUsage(
	dependencies: CodexUsageDependencies = defaultDependencies,
): Promise<ProviderUsage> {
	const resolved: Required<CodexUsageDependencies> = {
		...defaultDependencies,
		...dependencies,
	};
	const activeIdentity = resolved.profileStore.activeIdentity();
	let liveWindows: UsageWindow[] = [];
	let livePlanLabel: string | null = null;
	const result = await resolved.readRateLimits();
	const confirmedActiveIdentity = resolved.profileStore.activeIdentity();
	if (result.status === "not-configured") {
		const accounts = await rowsWithCurrentActive(
			resolved,
			confirmedActiveIdentity,
			liveWindows,
			livePlanLabel,
		);
		if (accounts.length > 0) {
			const active = activeAccountFrom(accounts);
			return {
				providerId: "codex",
				providerName: "Codex",
				status: statusFromAccounts(accounts),
				accountLabel: active?.accountLabel ?? active?.planLabel ?? null,
				activeAccountId: active?.id ?? null,
				accounts,
				windows: active?.windows ?? [],
				errorMessage: "Codex CLI is not installed.",
			};
		}
		return {
			providerId: "codex",
			providerName: "Codex",
			status: "not-configured",
			accountLabel: null,
			activeAccountId: null,
			accounts: [],
			windows: [],
			errorMessage: null,
		};
	}

	if (result.status === "ok") {
		const parsed = parseCodexUsageResponse(result.value);
		if (parsed.windows.length > 0) {
			const canAttributeLiveSnapshot = sameCodexIdentity(
				activeIdentity,
				confirmedActiveIdentity,
			);
			if (canAttributeLiveSnapshot && confirmedActiveIdentity) {
				liveWindows = parsed.windows;
				livePlanLabel = parsed.planLabel;
				await resolved.profileStore
					.putSnapshot({
						accountId: confirmedActiveIdentity.accountId,
						capturedAt: resolved.now(),
						planLabel: parsed.planLabel,
						windows: parsed.windows,
					})
					.catch((error) => {
						console.warn(
							"[provider-usage] Failed to persist Codex usage snapshot:",
							error,
						);
					});
			}
			const accounts = await rowsWithCurrentActive(
				resolved,
				confirmedActiveIdentity,
				liveWindows,
				livePlanLabel,
			);
			const active = activeAccountFrom(accounts);
			if (!canAttributeLiveSnapshot && accounts.length > 0) {
				return {
					providerId: "codex",
					providerName: "Codex",
					status: statusFromAccounts(accounts),
					accountLabel: active?.accountLabel ?? active?.planLabel ?? null,
					activeAccountId: active?.id ?? null,
					accounts,
					windows: active?.windows ?? [],
					errorMessage: null,
				};
			}
			return {
				providerId: "codex",
				providerName: "Codex",
				status: "ok",
				accountLabel: active?.accountLabel ?? parsed.accountLabel,
				activeAccountId: active?.id ?? null,
				accounts,
				windows: active?.windows ?? parsed.windows,
				errorMessage: null,
			};
		}
	}

	const accounts = await rowsWithCurrentActive(
		resolved,
		confirmedActiveIdentity,
		liveWindows,
		livePlanLabel,
	);
	const active = activeAccountFrom(accounts);
	if (accounts.some((account) => account.windows.length > 0)) {
		return {
			providerId: "codex",
			providerName: "Codex",
			status: statusFromAccounts(accounts),
			accountLabel: active?.accountLabel ?? active?.planLabel ?? null,
			activeAccountId: active?.id ?? null,
			accounts,
			windows: active?.windows ?? [],
			errorMessage: "Codex usage is temporarily unavailable.",
		};
	}

	return {
		providerId: "codex",
		providerName: "Codex",
		status: "unavailable",
		accountLabel: active?.accountLabel ?? null,
		activeAccountId: active?.id ?? null,
		accounts,
		windows: [],
		errorMessage: "Codex usage is temporarily unavailable.",
	};
}
