import { dirname } from "node:path";
import { env } from "../env";
import { getHostInstallSource, HOST_SERVICE_VERSION } from "../install-source";
import {
	execCliUpdate,
	pollHostHealth,
	SelfUpdater,
	type SelfUpdaterDeps,
	spawnDetachedHost,
} from "./SelfUpdater";

export {
	SelfUpdateError,
	type SelfUpdateStatus,
	type StartUpdateInput,
} from "./SelfUpdater";

let instance: SelfUpdater | null = null;

function productionDeps(): Omit<SelfUpdaterDeps, "stopServing"> {
	return {
		installSource: getHostInstallSource(),
		currentVersion: HOST_SERVICE_VERSION,
		execPath: process.execPath,
		port: env.PORT,
		secret: env.HOST_SERVICE_SECRET,
		stateDir: dirname(env.HOST_DB_PATH),
		runCliUpdate: execCliUpdate,
		spawnHost: spawnDetachedHost,
		pollHealth: pollHostHealth,
		exit: (code) => process.exit(code),
		log: (message) => console.log(`[host-service] ${message}`),
	};
}

/**
 * Wire the updater to this process. Only the standalone entry calls this
 * (it owns the HTTP server and relay socket the updater has to stop); the
 * desktop entry never does, and its host-service reports `updatable: false`.
 */
export function configureSelfUpdater(
	overrides: Pick<SelfUpdaterDeps, "stopServing"> & Partial<SelfUpdaterDeps>,
): SelfUpdater {
	instance = new SelfUpdater({ ...productionDeps(), ...overrides });
	return instance;
}

export function getSelfUpdater(): SelfUpdater {
	if (!instance) {
		instance = new SelfUpdater({
			...productionDeps(),
			installSource:
				getHostInstallSource() === "cli" ? "unknown" : getHostInstallSource(),
			// Nothing registered a way to stop serving, so this process must
			// not restart itself out from under whatever embeds it.
			stopServing: async () => {
				throw new Error("This host-service was not started standalone");
			},
		});
	}
	return instance;
}
