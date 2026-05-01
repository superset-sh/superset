// Public package surface — host-service imports from "@superset/pty-daemon" or
// "@superset/pty-daemon/protocol". Daemon implementation runtime is Node;
// host-service is a CLIENT of the daemon (importing protocol types only),
// not a runtime peer.

export { Server, type ServerOptions } from "./Server/index.ts";
export type { Session } from "./SessionStore/index.ts";
