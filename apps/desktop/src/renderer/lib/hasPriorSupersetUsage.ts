/**
 * True when this install has been used before. Backed by `tabs-storage`,
 * which is written the first time any workspace tab opens. Use this to
 * distinguish a fresh install from a returning user.
 */
export function hasPriorSupersetUsage(): boolean {
	if (typeof localStorage === "undefined") return false;
	return localStorage.getItem("tabs-storage") !== null;
}
