import * as p from "@clack/prompts";
import { boolean, CLIError, number, string } from "@superset/cli-framework";
import { command } from "../../lib/command";
import { SUPERSET_CONFIG_PATH } from "../../lib/config";
import { isProcessAlive, readManifest } from "../../lib/host/manifest";
import { spawnHostService } from "../../lib/host/spawn";
import { resolveOrganization } from "../../lib/resolve-org";

export default command({
	description: "Start the host service",
	options: {
		daemon: boolean().desc("Run in background"),
		port: number().desc("Port to listen on"),
		org: string().desc("Organization to register under (id, slug, or name)"),
	},
	run: async ({ ctx, options, signal }) => {
		const orgs = await ctx.api.user.myOrganizations.query();
		const organization = await resolveOrganization(orgs, options.org);

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
				authConfigPath:
					ctx.authSource === "oauth" ? SUPERSET_CONFIG_PATH : undefined,
				api: ctx.api,
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
