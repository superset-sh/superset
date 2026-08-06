import { CLIError } from "@superset/cli-framework";
import { command } from "../../lib/command";
import {
	isProcessAlive,
	readManifest,
	removeManifest,
} from "../../lib/host/manifest";
import {
	readPtyDaemonManifest,
	removePtyDaemonManifest,
} from "../../lib/host/pty-daemon-manifest";

/**
 * SIGTERM a pid, wait up to `timeoutMs`, then SIGKILL if still alive.
 * Returns the pid if it survived SIGKILL (caller should fail), null on
 * clean stop. `ESRCH` (already gone) is not an error.
 */
async function stopProcess(
	pid: number,
	label: string,
	timeoutMs: number,
): Promise<number | null> {
	try {
		process.kill(pid, "SIGTERM");
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ESRCH") return null;
		throw new CLIError(`Failed to stop ${label} (pid ${pid}): ${err.message}`);
	}

	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!isProcessAlive(pid)) return null;
		await new Promise((r) => setTimeout(r, 100));
	}

	if (!isProcessAlive(pid)) return null;
	try {
		process.kill(pid, "SIGKILL");
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ESRCH") return null;
		throw new CLIError(
			`Failed to SIGKILL ${label} (pid ${pid}): ${err.message}`,
		);
	}
	// Give SIGKILL a moment to land, then report survival as a failure.
	await new Promise((r) => setTimeout(r, 200));
	return isProcessAlive(pid) ? pid : null;
}

export default command({
	description: "Stop the host service daemon",
	run: async ({ ctx }) => {
		const organization = await ctx.api.user.myOrganization.query();
		if (!organization)
			throw new CLIError("No active organization", "Run: superset auth login");

		// Read BOTH manifests up front: the pty-daemon is spawned detached
		// and survives host-service restarts, so "no host service running"
		// must not leave a (possibly degraded, #6127) daemon listening for
		// re-adoption by the next `superset start`.
		const manifest = readManifest(organization.id);
		const daemonManifest = readPtyDaemonManifest(organization.id);

		const stopped: Array<{ label: string; pid: number }> = [];
		if (manifest && isProcessAlive(manifest.pid)) {
			await stopProcess(manifest.pid, "host service", 10_000);
			stopped.push({ label: "host service", pid: manifest.pid });
		}
		removeManifest(organization.id);

		let daemonSurvived: number | null = null;
		if (daemonManifest && isProcessAlive(daemonManifest.pid)) {
			daemonSurvived = await stopProcess(
				daemonManifest.pid,
				"pty-daemon",
				5_000,
			);
			if (daemonSurvived === null) {
				stopped.push({ label: "pty-daemon", pid: daemonManifest.pid });
			}
		}
		removePtyDaemonManifest(organization.id);

		if (daemonSurvived !== null) {
			throw new CLIError(
				`Failed to stop pty-daemon (pid ${daemonSurvived}): process survived SIGKILL`,
			);
		}

		if (stopped.length === 0) {
			return {
				data: { running: false },
				message: `No host service running for ${organization.name}`,
			};
		}

		return {
			data: { running: false },
			message: `Stopped ${stopped
				.map((s) => `${s.label} (pid ${s.pid})`)
				.join(", ")} for ${organization.name}`,
		};
	},
});
