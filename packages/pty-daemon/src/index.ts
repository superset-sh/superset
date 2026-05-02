// Public package surface — host-service imports from "@superset/pty-daemon" or
// "@superset/pty-daemon/protocol". Daemon implementation runtime is Node;
// host-service is a CLIENT of the daemon (importing protocol types only),
// not a runtime peer.

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
 * Source-of-truth version constant for the bundled daemon binary.
 * Hand-edited to match `packages/pty-daemon/package.json#version`.
 *
 * Used by callers that bundle the daemon (apps/desktop) and can't read
 * package.json at runtime — electron-vite collapses everything into one
 * file. The package's own main.ts uses readPackageVersion() instead.
 */
export const DAEMON_PACKAGE_VERSION = "0.2.0";
