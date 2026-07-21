import type {
	ProviderUsage,
	UsageWindow,
} from "lib/trpc/routers/provider-usage.schema";

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
