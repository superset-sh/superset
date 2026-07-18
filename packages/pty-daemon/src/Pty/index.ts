export type {
	AdoptOptions,
	Pty,
	PtyOnData,
	PtyOnExit,
	SpawnOptions,
} from "./Pty.ts";
export { adoptFromFd, drainPendingKills, spawn } from "./Pty.ts";
