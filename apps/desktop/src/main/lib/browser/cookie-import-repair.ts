import { session } from "electron";
import { appState } from "main/lib/app-state";
import { repairImportedCookieTwins } from "./chrome-cookie-import";

const BROWSER_PARTITION = "persist:superset";

/**
 * Runs the duplicate-cookie cleanup once per install. Earlier versions of the
 * Chrome cookie importer stored every host-only cookie as a domain cookie, and
 * a jar carrying both a `.host` and a host-only cookie of one name breaks the
 * sites that set them (Google sign-in lands on `CookieMismatch`). Re-importing
 * heals the affected cookies too, but nothing tells a user to re-import.
 */
export async function repairImportedCookiesOnce(): Promise<void> {
	if (appState.data.cookieImportRepaired) return;
	try {
		const repaired = await repairImportedCookieTwins(
			session.fromPartition(BROWSER_PARTITION),
		);
		if (repaired > 0) {
			console.log(`[browser] removed ${repaired} duplicate imported cookies`);
		}
		appState.data.cookieImportRepaired = true;
		await appState.write();
	} catch (error) {
		console.error("[browser] cookie import repair failed:", error);
	}
}
