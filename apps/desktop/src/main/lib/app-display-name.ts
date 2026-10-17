import { COMPANY } from "@superset/shared/constants";
import { app } from "electron";

/**
 * `appName` with its first word swapped for the display brand, keeping the
 * channel or dev-workspace suffix ("<brand> Canary", "<brand> (my-branch)").
 * `app.name` itself stays the productName: userData, logs and the keychain
 * entry are derived from it.
 */
export function toAppDisplayName(
	appName: string,
	brand: string = COMPANY.NAME,
): string {
	return appName.replace(/^\S+/, brand);
}

export function getAppDisplayName(): string {
	return toAppDisplayName(app.name);
}
