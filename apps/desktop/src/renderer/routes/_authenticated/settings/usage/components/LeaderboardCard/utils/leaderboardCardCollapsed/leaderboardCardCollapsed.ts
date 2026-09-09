const STORAGE_KEY = "leaderboard-card-collapsed-v1";

/** Fixed-size singleton: whether the leaderboard card on Usage is folded. */
export function readLeaderboardCardCollapsed(): boolean {
	try {
		return localStorage.getItem(STORAGE_KEY) === "true";
	} catch {
		return false;
	}
}

export function writeLeaderboardCardCollapsed(collapsed: boolean): void {
	try {
		if (collapsed) localStorage.setItem(STORAGE_KEY, "true");
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Storage unavailable/full — remembering the fold is best-effort.
	}
}
