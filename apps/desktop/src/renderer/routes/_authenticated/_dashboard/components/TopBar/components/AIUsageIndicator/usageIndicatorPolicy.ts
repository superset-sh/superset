import type {
	ProviderUsage,
	UsageWindow,
} from "lib/trpc/routers/provider-usage.schema";

export const PROVIDER_USAGE_REFETCH_INTERVAL_MS = 5 * 60_000;

export interface UsageMetricSelection {
	showsClaudeFiveHour: boolean;
	showsClaudeWeekly: boolean;
	showsClaudeFable: boolean;
	showsCodexWeekly: boolean;
}

export const defaultUsageMetricSelection: UsageMetricSelection = {
	showsClaudeFiveHour: true,
	showsClaudeWeekly: false,
	showsClaudeFable: false,
	showsCodexWeekly: true,
};

export function shouldQueryProviderUsage(open: boolean): boolean {
	return open;
}

export function getProviderUsageRefetchInterval(open: boolean): number | false {
	return open ? PROVIDER_USAGE_REFETCH_INTERVAL_MS : false;
}

export function getPrimaryWindow(provider: ProviderUsage): UsageWindow | null {
	if (provider.status !== "ok") return null;
	return (
		provider.windows
			.filter((window) => window.windowSeconds !== null)
			.sort(
				(left, right) =>
					(left.windowSeconds ?? Number.POSITIVE_INFINITY) -
					(right.windowSeconds ?? Number.POSITIVE_INFINITY),
			)[0] ??
		provider.windows[0] ??
		null
	);
}

export function getLowestRemainingPercent(
	providers: ProviderUsage[],
): number | null {
	const percentages = providers
		.map(getPrimaryWindow)
		.filter((window): window is UsageWindow => window !== null)
		.map((window) => window.remainingPercent);
	if (percentages.length === 0) return null;
	return Math.round(Math.min(...percentages));
}

function activeWindows(provider: ProviderUsage): UsageWindow[] {
	const active = provider.accounts.find((account) => account.isActive);
	if (!active) return provider.windows;
	const windowsById = new Map<string, UsageWindow>();
	for (const window of active.windows) windowsById.set(window.id, window);
	for (const window of provider.windows) {
		if (!windowsById.has(window.id)) windowsById.set(window.id, window);
	}
	return [...windowsById.values()];
}

function providerById(
	providers: ProviderUsage[],
	providerId: ProviderUsage["providerId"],
): ProviderUsage | null {
	return (
		providers.find((provider) => provider.providerId === providerId) ?? null
	);
}

function findWindowByMinutes(
	provider: ProviderUsage,
	windowSeconds: number,
): UsageWindow | null {
	return (
		activeWindows(provider).find(
			(window) => window.windowSeconds === windowSeconds,
		) ?? null
	);
}

function findFableWindow(provider: ProviderUsage): UsageWindow | null {
	return (
		activeWindows(provider).find((window) => {
			const label = window.label.toLowerCase();
			return label.includes("fable") || label.includes("feeable");
		}) ?? null
	);
}

function roundedRemaining(window: UsageWindow | null): number | null {
	return window ? Math.round(window.remainingPercent) : null;
}

export function getMenuBarSummaryParts(
	providers: ProviderUsage[],
	selection: UsageMetricSelection = defaultUsageMetricSelection,
): string[] {
	const parts: string[] = [];
	const claude = providerById(providers, "claude");
	if (claude?.status === "ok") {
		let hasClaudeMetric = false;
		const selectedClaudeMetricCount = [
			selection.showsClaudeFiveHour,
			selection.showsClaudeWeekly,
			selection.showsClaudeFable,
		].filter(Boolean).length;
		if (selection.showsClaudeFiveHour) {
			const value =
				roundedRemaining(findWindowByMinutes(claude, 5 * 60 * 60)) ?? "—";
			parts.push(
				selectedClaudeMetricCount > 1 ? `A 5h ${value}` : `A ${value}`,
			);
			hasClaudeMetric = true;
		}
		if (selection.showsClaudeWeekly) {
			const value =
				roundedRemaining(findWindowByMinutes(claude, 7 * 24 * 60 * 60)) ?? "—";
			parts.push(hasClaudeMetric ? `W ${value}` : `A W ${value}`);
			hasClaudeMetric = true;
		}
		if (selection.showsClaudeFable) {
			const value = roundedRemaining(findFableWindow(claude)) ?? "—";
			parts.push(hasClaudeMetric ? `F ${value}` : `A F ${value}`);
		}
	}

	const codex = providerById(providers, "codex");
	if (selection.showsCodexWeekly && codex?.status === "ok") {
		const value =
			roundedRemaining(findWindowByMinutes(codex, 7 * 24 * 60 * 60)) ?? "—";
		parts.push(`C ${value}`);
	}
	return parts;
}

export function getLowestSelectedRemainingPercent(
	providers: ProviderUsage[],
	selection: UsageMetricSelection = defaultUsageMetricSelection,
): number | null {
	const values = getMenuBarSummaryParts(providers, selection)
		.map((part) => Number(part.split(" ").at(-1)))
		.filter((value) => Number.isFinite(value));
	if (values.length === 0) return getLowestRemainingPercent(providers);
	return Math.min(...values);
}

export function formatResetLabel(
	resetAt: number,
	now = Date.now(),
	timeZone?: string,
): string {
	const remainingMinutes = Math.max(0, Math.floor((resetAt - now) / 60_000));
	const hours = Math.floor(remainingMinutes / 60);
	const minutes = remainingMinutes % 60;
	const relative = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
	const dateFormatter = new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		...(timeZone ? { timeZone } : {}),
	});
	const timeFormatter = new Intl.DateTimeFormat("en-US", {
		hour: "numeric",
		minute: "2-digit",
		...(timeZone ? { timeZone } : {}),
	});
	return `${relative} · ${dateFormatter.format(resetAt)}, ${timeFormatter.format(resetAt)}`;
}
