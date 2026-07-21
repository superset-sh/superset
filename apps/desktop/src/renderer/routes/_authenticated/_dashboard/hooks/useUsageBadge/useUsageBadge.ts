import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

type UsageBadgeTone = "amber" | "red" | null;

interface UsageBadge {
	/** Worst window used-% across every provider, or null if none has data. */
	worstUsedPct: number | null;
	/** Badge color by urgency, gated by the showSidebarBadge setting. */
	tone: UsageBadgeTone;
}

function toneFor(usedPct: number | null): UsageBadgeTone {
	if (usedPct === null) return null;
	if (usedPct >= 95) return "red";
	if (usedPct >= 80) return "amber";
	return null;
}

export function useUsageBadge(): UsageBadge {
	const { data: initial } = electronTrpc.usage.getSnapshot.useQuery();
	const [live, setLive] = useState<typeof initial>();
	electronTrpc.usage.subscribe.useSubscription(undefined, {
		onData: setLive,
	});
	const { data: settings } = electronTrpc.usage.getSettings.useQuery();

	const snapshots = live ?? initial ?? [];
	let worst: number | null = null;
	for (const snapshot of snapshots) {
		for (const window of snapshot.windows) {
			worst = worst === null ? window.usedPct : Math.max(worst, window.usedPct);
		}
	}

	if (settings && !settings.showSidebarBadge) {
		return { worstUsedPct: worst, tone: null };
	}

	return { worstUsedPct: worst, tone: toneFor(worst) };
}
