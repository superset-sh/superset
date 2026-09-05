import type { ViewerProfile } from "@superset/trpc/leaderboard-types";

export type { ViewerProfile };

let inflight: Promise<ViewerProfile | null> | null = null;

export function fetchViewer(): Promise<ViewerProfile | null> {
	inflight ??= fetch("/api/viewer", { credentials: "include" })
		.then((response) => (response.ok ? response.json() : { viewer: null }))
		.then((data: { viewer: ViewerProfile | null }) => data.viewer ?? null)
		.catch((error) => {
			console.error("[marketing/viewer] fetch failed:", error);
			return null;
		})
		.finally(() => {
			inflight = null;
		});

	return inflight;
}
