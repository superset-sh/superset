import { version } from "~/package.json";
import {
	resolveDaemonScriptPath,
	TerminalDaemonClient,
	type TerminalDaemonClientEvents,
} from "./daemon-client";
import { TERMINAL_SUPERVISOR_RUNTIME_PATHS } from "./runtime-paths";

export type TerminalHostClient = TerminalDaemonClient;
export type TerminalHostClientEvents = TerminalDaemonClientEvents;

function getTerminalSupervisorScriptPath(): string {
	return resolveDaemonScriptPath({
		moduleDir: __dirname,
		sourceRelativePath: "../../terminal-supervisor/index.ts",
		bundledRelativePath: "../../terminal-supervisor.js",
	});
}

let clientInstance: TerminalDaemonClient | null = null;

export function getTerminalHostClient(): TerminalHostClient {
	if (!clientInstance) {
		clientInstance = new TerminalDaemonClient({
			daemonName: "terminal-supervisor",
			daemonScriptPath: getTerminalSupervisorScriptPath(),
			helloMetadata: {
				appVersion: version,
				preferredWorkerGeneration: version,
			},
			runtimePaths: TERMINAL_SUPERVISOR_RUNTIME_PATHS,
		});
	}

	return clientInstance;
}

export function disposeTerminalHostClient(): void {
	if (!clientInstance) return;

	clientInstance.dispose();
	clientInstance = null;
}
