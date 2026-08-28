const STORAGE_KEY = "leaderboard-asked-v1";

export function readLeaderboardAsked(): boolean {
	try {
		return localStorage.getItem(STORAGE_KEY) === "true";
	} catch {
		return true;
	}
}

export function markLeaderboardAsked(): void {
	try {
		localStorage.setItem(STORAGE_KEY, "true");
	} catch {
		return;
	}
}
