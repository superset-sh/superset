import * as p from "@clack/prompts";
import { boolean, CLIError, number, string } from "@superset/cli-framework";
import { command } from "../../lib/command";
import { SUPERSET_CONFIG_PATH } from "../../lib/config";
import { waitForUnresponsiveHost } from "../../lib/host/liveness";
import {
	isProcessAlive,
	readManifest,
	removeManifest,
} from "../../lib/host/manifest";
import {
	describeHostExit,
	type SpawnHostResult,
	spawnHostService,
} from "../../lib/host/spawn";
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
		const organization = await resolveOrganization(
			orgs,
			options.org ?? process.env.SUPERSET_ORGANIZATION_ID,
		);

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

		let running: SpawnHostResult;
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

			running = result;
		} catch (error) {
			spinner.stop("Failed to start host service");
			throw new CLIError(
				error instanceof Error ? error.message : "Unknown error",
			);
		}

		const stopWatching = new AbortController();
		signal.addEventListener("abort", () => stopWatching.abort(), {
			once: true,
		});
		const failure = await Promise.race([
			running.exited.then(
				(exit) => `exited unexpectedly (${describeHostExit(exit)})`,
			),
			waitForUnresponsiveHost({
				endpoint: `http://127.0.0.1:${running.port}`,
				authToken: running.secret,
				signal: stopWatching.signal,
			}).then((unresponsive) =>
				unresponsive ? "stopped answering health checks" : null,
			),
		]);
		stopWatching.abort();

		if (failure && !signal.aborted) {
			// A wedged event loop never runs a SIGTERM handler.
			if (isProcessAlive(running.pid)) process.kill(running.pid, "SIGKILL");
			if (readManifest(organization.id)?.pid === running.pid) {
				removeManifest(organization.id);
			}
			throw new CLIError(
				`Host service ${failure}`,
				"Run it under a supervisor that restarts on failure, e.g. systemd with Restart=on-failure.",
			);
		}

		return {
			data: {
				pid: running.pid,
				port: running.port,
				organizationId: organization.id,
			},
			message: "Host service stopped",
		};
	},
});
