// Public package surface — host-service imports from "@superset/pty-daemon" or
// "@superset/pty-daemon/protocol". Daemon implementation runtime is Node;
// host-service is a CLIENT of the daemon (importing protocol types only),
// not a runtime peer.

import packageJson from "../package.json" with { type: "json" };

export { Server, type ServerOptions } from "./Server/index.ts";
export type {
	HandoffSnapshot,
	SerializedSession,
	Session,
} from "./SessionStore/index.ts";
export {
	clearSnapshot,
	readSnapshot,
	writeSnapshot,
} from "./SessionStore/index.ts";

/**
 * Daemon binary version. Inlined from package.json by the bundler so
 * callers that can't readFileSync at runtime (apps/desktop, Electron)
 * still get the right value.
 */
export const DAEMON_PACKAGE_VERSION: string = packageJson.version;
