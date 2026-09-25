export { DaemonTerminalManager } from "./daemon-manager";

import { DaemonTerminalManager } from "./daemon-manager";

let daemonManager: DaemonTerminalManager | null = null;

export function getDaemonTerminalManager(): DaemonTerminalManager {
	if (!daemonManager) {
		daemonManager = new DaemonTerminalManager();
	}
	return daemonManager;
}
