export { supportsRemoteUpdate } from "./capability";
export * from "./protocol";
export {
	spawnUpdateSupervisor,
	terminateUpdateSupervisor,
} from "./spawn-supervisor";
export {
	classifyUpdateTarget,
	HOST_SERVICE_VERSION,
	isInstallableUpdateVersion,
} from "./version";
