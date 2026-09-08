import {
	deriveHostVersionState,
	type HostVersionState,
} from "@superset/shared/host-version";
import { useMemo } from "react";

/**
 * The version this client expects a host-service to be on. Desktop,
 * host-service and CLI ship one unified version, so the app's own version
 * is the target for every host it can update.
 */
export function useAppVersion(): string {
	return window.App.appVersion;
}

export function useHostVersionState(
	hostVersion: string | null | undefined,
): HostVersionState {
	const appVersion = useAppVersion();
	return useMemo(
		() => deriveHostVersionState(hostVersion, appVersion),
		[hostVersion, appVersion],
	);
}
