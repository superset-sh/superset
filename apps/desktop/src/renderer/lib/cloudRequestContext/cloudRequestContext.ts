import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import { getAuthToken } from "../auth-client";

/**
 * The organization this window's cloud reads are scoped to.
 *
 * Module state is per-renderer, and every window is its own renderer, so this
 * is per-window by construction — two windows cannot see each other's value.
 * Without it the API falls back to the login session's active organization,
 * which is shared by every window: a window switched to another org would read
 * the first window's data.
 *
 * Null until CollectionsProvider resolves the window's org, which is also the
 * pre-sign-in state; the API then applies its session default as before.
 */
let cloudOrganizationId: string | null = null;

export function setCloudOrganizationId(organizationId: string | null): void {
	cloudOrganizationId = organizationId;
}

export function getCloudRequestHeaders(): Record<string, string> {
	const token = getAuthToken();
	const version = window.App?.appVersion;
	return {
		...(token ? { Authorization: `Bearer ${token}` } : {}),
		...(cloudOrganizationId
			? { [ORGANIZATION_HEADER]: cloudOrganizationId }
			: {}),
		...(version ? { "x-superset-client": `desktop/${version}` } : {}),
	};
}
