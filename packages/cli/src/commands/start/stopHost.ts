import { readManifest, removeManifest } from "../../lib/host/manifest";
import type { HostExit } from "../../lib/host/spawn";

const STOP_TIMEOUT_MS = 10_000;

function signalHost(pid: number, signal: NodeJS.Signals): void {
	try {
		process.kill(pid, signal);
	} catch {}
}

export async function stopHost({
	organizationId,
	pid,
	exited,
	timeoutMs = STOP_TIMEOUT_MS,
}: {
	organizationId: string;
	pid: number;
	exited: Promise<HostExit>;
	timeoutMs?: number;
}): Promise<HostExit> {
	signalHost(pid, "SIGTERM");
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timedOut = new Promise<null>((resolve) => {
		timer = setTimeout(() => resolve(null), timeoutMs);
	});
	let exit = await Promise.race([exited, timedOut]);
	clearTimeout(timer);
	if (!exit) {
		signalHost(pid, "SIGKILL");
		exit = await exited;
	}
	if (readManifest(organizationId)?.pid === pid) removeManifest(organizationId);
	return exit;
}
