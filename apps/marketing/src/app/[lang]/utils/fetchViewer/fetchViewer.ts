import type { ViewerProfile } from "@superset/trpc/leaderboard-types";
import { viewerClient } from "../leaderboardClient";

export type { ViewerProfile };

let inflight: Promise<ViewerProfile | null> | null = null;

/**
 * Signed-out callers get a 401 from the procedure, which is the normal case on a
 * public page — so every failure resolves to null rather than throwing. The
 * viewer only drives cosmetics (your own row highlighted), so a null degrades to
 * "no highlight" instead of breaking the board.
 */
export function fetchViewer(): Promise<ViewerProfile | null> {
	inflight ??= viewerClient.leaderboard.viewer
		.query()
		.then((viewer) => viewer ?? null)
		.catch(() => null)
		.finally(() => {
			inflight = null;
		});

	return inflight;
}
