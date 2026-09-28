import { boolean, CLIError } from "@superset/cli-framework";
import { command } from "../../lib/command";
import { readManifest, removeManifestIfOwnedBy } from "../../lib/host/manifest";
import { stopTerminalDaemon } from "../../lib/host/terminal-daemon";
import { terminateProcess } from "../../lib/host/terminate";

export default command({
	sandbox: false,
	description: "Stop the host service daemon",
	options: {
		terminals: boolean().desc(
			"Also stop the terminal daemon, ending every terminal and agent",
		),
	},
	run: async ({ ctx, options }) => {
		const organization = await ctx.api.user.myOrganization.query();
		if (!organization)
			throw new CLIError("No active organization", "Run: superset auth login");

		const manifest = readManifest(organization.id);
		if (manifest) {
			try {
				await terminateProcess(manifest.pid);
			} catch (error) {
				throw new CLIError(
					`Failed to stop host service (pid ${manifest.pid}): ${
						error instanceof Error ? error.message : "unknown error"
					}`,
				);
			}
			removeManifestIfOwnedBy(organization.id, manifest.pid);
		}

		const terminalDaemonPid = options.terminals
			? await stopTerminalDaemon(organization.id)
			: null;

		if (!manifest && terminalDaemonPid === null) {
			return {
				data: { running: false },
				message: `No host service running for ${organization.name}`,
			};
		}

		const stopped = [
			manifest ? "host service" : null,
			terminalDaemonPid !== null ? "terminal daemon" : null,
		]
			.filter(Boolean)
			.join(" and ");
		return {
			data: {
				pid: manifest?.pid ?? null,
				terminalDaemonPid,
				organizationId: organization.id,
			},
			message: `Stopped ${stopped} for ${organization.name}`,
		};
	},
});
