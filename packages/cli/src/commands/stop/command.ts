import { CLIError } from "@superset/cli-framework";
import { command } from "../../lib/command";
import {
	isProcessAlive,
	readManifest,
	removeManifest,
} from "../../lib/host/manifest";
import { readPtyDaemonManifest } from "../../lib/host/pty-daemon-manifest";

export default command({
	description: "Stop the host service daemon",
	run: async ({ ctx }) => {
		const organization = await ctx.api.user.myOrganization.query();
		if (!organization)
			throw new CLIError("No active organization", "Run: superset auth login");

		const manifest = readManifest(organization.id);
		if (!manifest) {
			return {
				data: { running: false },
				message: `No host service running for ${organization.name}`,
			};
		}

		if (isProcessAlive(manifest.pid)) {
			try {
				process.kill(manifest.pid, "SIGTERM");
			} catch (error) {
				throw new CLIError(
					`Failed to stop host service (pid ${manifest.pid}): ${
						error instanceof Error ? error.message : "unknown error"
					}`,
				);
			}

			const deadline = Date.now() + 10_000;
			while (Date.now() < deadline) {
				if (!isProcessAlive(manifest.pid)) break;
				await new Promise((r) => setTimeout(r, 100));
			}

			if (isProcessAlive(manifest.pid)) {
				try {
					process.kill(manifest.pid, "SIGKILL");
				} catch {}
			}
		}

		removeManifest(organization.id);

		// The pty-daemon is spawned detached (`DaemonSupervisor`) so PTY
		// sessions survive host-service restarts — but that also means it
		// outlives `superset stop`, keeps listening on its socket, and gets
		// re-adopted (possibly in a degraded state, #6127) by the next
		// host-service. Stop it here so `superset stop` means "stop
		// everything", not "stop the host-service and leave a daemon
		// running".
		const daemonManifest = readPtyDaemonManifest(organization.id);
		if (daemonManifest && isProcessAlive(daemonManifest.pid)) {
			try {
				process.kill(daemonManifest.pid, "SIGTERM");
			} catch (error) {
				throw new CLIError(
					`Failed to stop pty-daemon (pid ${daemonManifest.pid}): ${
						error instanceof Error ? error.message : "unknown error"
					}`,
				);
			}
			const daemonDeadline = Date.now() + 5_000;
			while (Date.now() < daemonDeadline) {
				if (!isProcessAlive(daemonManifest.pid)) break;
				await new Promise((r) => setTimeout(r, 100));
			}
			if (isProcessAlive(daemonManifest.pid)) {
				try {
					process.kill(daemonManifest.pid, "SIGKILL");
				} catch {}
			}
		}

		return {
			data: { running: false },
			message: `Stopped host service and pty-daemon for ${organization.name}`,
		};
	},
});
