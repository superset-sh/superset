import {
	type PtyDaemonManifest,
	readPtyDaemonManifest,
	removePtyDaemonManifest,
} from "@superset/host-service/daemon-manifest";
import {
	type ProbeAttemptOutcome,
	probeDaemonHello,
} from "@superset/host-service/daemon-probe";
import { terminateProcess } from "./terminate";

const HELLO_TIMEOUT_MS = 1_500;
// A handoff in flight when the host stopped can leave a successor bound to the
// socket after the predecessor exits.
const MAX_DAEMONS_ON_SOCKET = 3;

function removeManifestIfUnchanged(read: PtyDaemonManifest): void {
	const current = readPtyDaemonManifest(read.organizationId);
	if (current?.pid === read.pid && current.startedAt === read.startedAt) {
		removePtyDaemonManifest(read.organizationId);
	}
}

/**
 * Stops the terminal daemon, which ends every terminal and agent under it.
 * Signals only the pid the daemon reports over its socket: the manifest pid
 * can be stale and belong to an unrelated process by now.
 * Returns the stopped daemon pids, empty when nothing listens on the socket.
 */
export async function stopTerminalDaemon(
	organizationId: string,
): Promise<number[]> {
	const manifest = readPtyDaemonManifest(organizationId);
	if (!manifest) return [];

	const stopped: number[] = [];
	for (let i = 0; i < MAX_DAEMONS_ON_SOCKET; i++) {
		const outcome: ProbeAttemptOutcome = {};
		const hello = await probeDaemonHello(
			manifest.socketPath,
			HELLO_TIMEOUT_MS,
			outcome,
		);
		if (!hello) {
			if (outcome.noListener) break;
			throw new Error(
				"The terminal daemon did not answer on its socket, so it cannot be stopped safely. Try again.",
			);
		}
		if (!hello.daemonPid) {
			throw new Error(
				`The terminal daemon (version ${hello.daemonVersion}) does not report its pid, so it cannot be stopped safely. Run \`superset start\` once so the host updates the daemon, then try again.`,
			);
		}
		if (stopped.includes(hello.daemonPid)) break;
		await terminateProcess(hello.daemonPid);
		stopped.push(hello.daemonPid);
	}

	removeManifestIfUnchanged(manifest);
	return stopped;
}
