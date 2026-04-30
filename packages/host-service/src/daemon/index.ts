export {
	DaemonSupervisor,
	type DaemonSupervisorOptions,
	listDaemonSessions,
	probeDaemonVersion,
} from "./DaemonSupervisor.ts";
export { EXPECTED_DAEMON_VERSION } from "./expected-version.ts";
export {
	__resetSupervisorForTesting,
	getSupervisor,
	resolveSupervisorScriptPath,
	startDaemonBootstrap,
	waitForDaemonReady,
} from "./singleton.ts";
