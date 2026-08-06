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
 * SIGTERM a pid, wait up to `timeoutMs`, then SIGKILL if still alive and
 * poll briefly for it to be reaped. Returns the pid if it survived
 * everything (caller should fail), null on clean stop. `ESRCH` (already
 * gone) is not an error.
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
	// Poll after SIGKILL (rather than a single fixed wait): a process in
	// uninterruptible sleep can take longer than 200ms to be reaped, and
	// the result should reflect the actual outcome.
	const reapDeadline = Date.now() + 2_000;
	while (Date.now() < reapDeadline) {
		if (!isProcessAlive(pid)) return null;
		await new Promise((r) => setTimeout(r, 100));
	}
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

		const failures: string[] = [];
		const stopped: Array<{ label: string; pid: number }> = [];

		// Only remove each manifest once the process is CONFIRMED dead: a
		// survivor must stay discoverable by `superset start`/`stop` rather
		// than being orphaned without a manifest.
		if (manifest && isProcessAlive(manifest.pid)) {
			const survived = await stopProcess(manifest.pid, "host service", 10_000);
			if (survived !== null) {
				failures.push(`host service (pid ${survived}) survived SIGKILL`);
			} else {
				stopped.push({ label: "host service", pid: manifest.pid });
			}
			removeManifest(organization.id);
		} else {
			removeManifest(organization.id);
		}

		if (daemonManifest && isProcessAlive(daemonManifest.pid)) {
			const survived = await stopProcess(
				daemonManifest.pid,
				"pty-daemon",
				5_000,
			);
			if (survived !== null) {
				failures.push(`pty-daemon (pid ${survived}) survived SIGKILL`);
			} else {
				stopped.push({ label: "pty-daemon", pid: daemonManifest.pid });
			}
			removePtyDaemonManifest(organization.id);
		} else {
			removePtyDaemonManifest(organization.id);
		}

		if (failures.length > 0) {
			throw new CLIError(
				`Failed to stop: ${failures.join("; ")} — the process may still be running`,
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
