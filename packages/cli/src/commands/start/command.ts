import * as p from "@clack/prompts";
import { boolean, CLIError, number } from "@superset/cli-framework";
import { command } from "../../lib/command";
import { isProcessAlive, readManifest } from "../../lib/host/manifest";
import { spawnHostService } from "../../lib/host/spawn";

export default command({
	description: "Start the host service",
	options: {
		daemon: boolean().desc("Run in background"),
		port: number().desc("Port to listen on"),
	},
	run: async ({ ctx, options, signal }) => {
		const organization = await ctx.api.user.myOrganization.query();
		if (!organization)
			throw new CLIError("No active organization", "Run: superset auth login");

		const existing = readManifest(organization.id);
		if (existing && isProcessAlive(existing.pid)) {
			return {
				data: { pid: existing.pid, endpoint: existing.endpoint },
				message: `Host service already running for ${organization.name} (pid ${existing.pid})`,
			};
		}

		p.intro(`superset start (${organization.name})`);
		const spinner = p.spinner();
		spinner.start("Starting host service...");

		try {
			const result = await spawnHostService({
				organizationId: organization.id,
				sessionToken: ctx.bearer,
				port: options.port,
				daemon: options.daemon ?? false,
			});

			spinner.stop(
				`Host service running on port ${result.port} (pid ${result.pid})`,
			);
			p.log.info("Connected to relay — machine is now accessible.");

			if (options.daemon) {
				p.outro("Running in background.");
				return {
					data: {
						pid: result.pid,
						port: result.port,
						organizationId: organization.id,
					},
					message: `Host service started for ${organization.name}`,
				};
			}

			p.outro("Press Ctrl+C to stop.");

			await new Promise<void>((resolve) => {
				signal.addEventListener("abort", () => resolve(), { once: true });
			});

			return {
				data: {
					pid: result.pid,
					port: result.port,
					organizationId: organization.id,
				},
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
