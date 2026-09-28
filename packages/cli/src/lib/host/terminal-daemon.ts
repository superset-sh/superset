import { createConnection } from "node:net";
import {
	readPtyDaemonManifest,
	removePtyDaemonManifest,
} from "@superset/host-service/daemon-manifest";
import { terminateProcess } from "./terminate";

const SOCKET_PROBE_TIMEOUT_MS = 1_000;

function isSocketListening(socketPath: string): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection(socketPath);
		const finish = (listening: boolean) => {
			clearTimeout(timer);
			socket.destroy();
			resolve(listening);
		};
		const timer = setTimeout(() => finish(false), SOCKET_PROBE_TIMEOUT_MS);
		socket.once("connect", () => finish(true));
		socket.once("error", () => finish(false));
	});
}

/**
 * Stops the terminal daemon, which ends every terminal and agent under it.
 * A manifest whose socket no longer answers is stale: its pid may belong to
 * an unrelated process by now, so it is removed without a signal.
 * Returns the daemon pid, or null when no daemon was running.
 */
export async function stopTerminalDaemon(
	organizationId: string,
): Promise<number | null> {
	const manifest = readPtyDaemonManifest(organizationId);
	if (!manifest) return null;
	if (!(await isSocketListening(manifest.socketPath))) {
		removePtyDaemonManifest(organizationId);
		return null;
	}
	await terminateProcess(manifest.pid);
	if (manifest.handoffInProgress && manifest.handoffSuccessorPid) {
		await terminateProcess(manifest.handoffSuccessorPid);
	}
	removePtyDaemonManifest(organizationId);
	return manifest.pid;
}
