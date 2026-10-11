import { COMPANY } from "@superset/shared/constants";
import { app } from "electron";

/**
 * `app.name` with the brand word swapped for the display brand, keeping the
 * channel or dev-workspace suffix ("<brand> Canary", "<brand> (my-branch)").
 * `app.name` itself stays the productName: userData, logs and the keychain
 * entry are derived from it.
 */
export function getAppDisplayName(): string {
	return app.name.replace(/^\S+/, COMPANY.NAME);
}
