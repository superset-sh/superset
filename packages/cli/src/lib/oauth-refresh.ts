import {
	REFRESH_TIMINGS,
	type RefreshedConfig,
	refreshLockPath,
	refreshStoredAuth as refreshSharedConfig,
} from "@superset/shared/oauth-refresh";
import { refreshAccessToken } from "./auth";
import {
	getSupersetConfigPath,
	readConfig,
	type SupersetConfig,
	writeConfig,
} from "./config";

export {
	isAuthFresh,
	RefreshInProgressError,
	ServerUnreachableError,
	SessionExpiredError,
} from "@superset/shared/oauth-refresh";

export function refreshStoredAuth(): Promise<RefreshedConfig<SupersetConfig>> {
	return refreshSharedConfig<SupersetConfig>({
		refresh: refreshAccessToken,
		readConfig,
		writeConfig: (config) => writeConfig(config),
		lockPath: refreshLockPath(getSupersetConfigPath()),
		...REFRESH_TIMINGS,
		now: () => Date.now(),
		sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	});
}
