/**
 * FD passing spike (Task 3 of fresh-mach-context-spawn plan).
 *
 * Goal: validate round-trip FD transfer over a Unix Domain Socket using
 * SCM_RIGHTS so future tasks (Task 8/13) can ship stdin/stdout/stderr FDs
 * from Electron's main process to the terminal-host daemon.
 *
 * Result: `node-unix-socket@0.2.7` does NOT expose SCM_RIGHTS FD passing
 * and its SOCK_SEQPACKET transport is not available on macOS (the addon
 * throws "Protocol not supported" on darwin-arm64). The wrapper below
 * imports the package for bookkeeping and throws a clear error explaining
 * the gap. A native N-API addon (Task 3.6 in the plan) is required to
 * actually move FDs between unrelated processes via SCM_RIGHTS.
 */

// We intentionally import from the package so the spike still fails loudly
// (rather than silently) if someone assumes node-unix-socket gained FD
// passing in a later version. The imports double as a smoke test that the
// dependency is installed and resolvable.
import { SeqpacketServer, SeqpacketSocket } from "node-unix-socket";

const UNSUPPORTED_MESSAGE =
	"node-unix-socket does not support SCM_RIGHTS FD passing. " +
	"Its Seqpacket/Dgram surface has no sendFd/recvFd API, and on macOS " +
	"SeqpacketServer/SeqpacketSocket fail with 'Protocol not supported'. " +
	"A native N-API addon (sendmsg/recvmsg with SCM_RIGHTS) is required. " +
	"See apps/desktop/plans/20260417-1500-fresh-mach-context-spawn.md Step 3.6.";

/**
 * Hypothetical signature from the design doc. The implementation cannot be
 * realised with node-unix-socket; this function exists so the test and
 * downstream callers fail with an actionable error until a native addon
 * lands.
 */
export function sendFd(
	_socketPath: string,
	_fd: number,
	_onConnected: () => void,
): void {
	// Reference the imports so bundlers/lint don't strip them; also prove
	// the module loads without throwing at require-time.
	void SeqpacketServer;
	void SeqpacketSocket;
	throw new Error(UNSUPPORTED_MESSAGE);
}

/**
 * Hypothetical signature from the design doc. See `sendFd` above.
 */
export function recvFd(_socketPath: string): Promise<number> {
	return Promise.reject(new Error(UNSUPPORTED_MESSAGE));
}
