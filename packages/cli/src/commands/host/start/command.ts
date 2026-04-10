import * as p from "@clack/prompts";
import { boolean, CLIError, command, number } from "@superset/cli-framework";
import { readConfig } from "../../../lib/config";
import { isProcessAlive, readManifest } from "../../../lib/host/manifest";
import { spawnHostService } from "../../../lib/host/spawn";

export default command({
	description: "Start the host service",
	options: {
		daemon: boolean().desc("Run in background"),
		port: number().desc("Port to listen on"),
	},
	run: async (opts) => {
		const config = readConfig();

		if (!config.auth?.accessToken) {
			throw new CLIError("Not authenticated", "Run: superset auth login");
		}

		if (!config.activeOrg) {
			throw new CLIError("No active organization", "Run: superset org switch");
		}

		const { id: organizationId, name: orgName } = config.activeOrg;

		// Check if already running
		const existing = readManifest(organizationId);
		if (existing && isProcessAlive(existing.pid)) {
			return {
				data: { pid: existing.pid, endpoint: existing.endpoint },
				message: `Host service already running for ${orgName} (pid ${existing.pid})`,
			};
		}

		p.intro(`superset host start (${orgName})`);
		const spinner = p.spinner();
		spinner.start("Starting host service...");

		try {
			const result = await spawnHostService({
				organizationId,
				sessionToken: config.auth.accessToken,
				port: opts.options.port,
				daemon: opts.options.daemon ?? false,
			});

			spinner.stop(
				`Host service running on port ${result.port} (pid ${result.pid})`,
			);
			p.log.info("Connected to relay — machine is now accessible.");

			if (opts.options.daemon) {
				p.outro("Running in background.");
				return {
					data: {
						pid: result.pid,
						port: result.port,
						organizationId,
					},
					message: `Host service started for ${orgName}`,
				};
			}

			p.outro("Press Ctrl+C to stop.");

			// Foreground: wait for signal
			await new Promise<void>((resolve) => {
				opts.signal.addEventListener("abort", () => resolve(), { once: true });
			});

			return {
				data: { pid: result.pid, port: result.port, organizationId },
				message: "Host service stopped",
			};
		} catch (error) {
			spinner.stop("Failed to start host service");
			throw new CLIError(
				error instanceof Error ? error.message : "Unknown error",
			);
		}
	},
});
