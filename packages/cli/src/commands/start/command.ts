import * as p from "@clack/prompts";
import { boolean, CLIError, number, string } from "@superset/cli-framework";
import { command } from "../../lib/command";
import { SUPERSET_CONFIG_PATH } from "../../lib/config";
import { waitForUnresponsiveHost } from "../../lib/host/liveness";
import {
	isProcessAlive,
	readManifest,
	removeManifestIfOwnedBy,
} from "../../lib/host/manifest";
import { isManifestLive } from "../../lib/host/manifest-liveness";
import {
	describeHostExit,
	type SpawnHostResult,
	spawnHostService,
} from "../../lib/host/spawn";
import { terminateProcess } from "../../lib/host/terminate";
import { resolveOrganization } from "../../lib/resolve-org";

export default command({
	sandbox: false,
	description: "Start the host service",
	options: {
		daemon: boolean().desc("Run in background"),
		autoUpdate: boolean().desc(
			"Automatically update and restart this host hourly (requires --daemon)",
		),
		port: number().desc("Port to listen on"),
		org: string().desc("Organization to register under (id, slug, or name)"),
	},
	run: async ({ ctx, options, signal }) => {
		if (options.autoUpdate && !options.daemon) {
			throw new CLIError(
				"--auto-update requires --daemon because updates replace the host process.",
				"Run superset start --daemon --auto-update.",
			);
		}

		const orgs = await ctx.api.user.myOrganizations.query();
		const organization = await resolveOrganization(
			orgs,
			options.org ?? process.env.SUPERSET_ORGANIZATION_ID,
		);

		const existing = readManifest(organization.id);
		if (existing) {
			if (await isManifestLive(existing)) {
				return {
					data: { pid: existing.pid, endpoint: existing.endpoint },
					message: `Host service already running for ${organization.name} (pid ${existing.pid})`,
				};
			}
			// A live pid alone doesn't prove it's ours — OSes recycle pids, and a
			// leftover manifest can point at an unrelated process.
			removeManifestIfOwnedBy(organization.id, existing.pid);
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
				autoUpdate: options.autoUpdate ?? false,
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
		const failure = await Promise.race([
			running.exited.then(
				(exit) => `exited unexpectedly (${describeHostExit(exit)})`,
			),
			waitForUnresponsiveHost({
				endpoint: `http://127.0.0.1:${running.port}`,
				authToken: running.secret,
				signal: AbortSignal.any([signal, stopWatching.signal]),
			}).then((unresponsive) =>
				unresponsive ? "stopped answering health checks" : null,
			),
		]);
		stopWatching.abort();

		if (failure && !signal.aborted) {
			// A wedged event loop never runs a SIGTERM handler.
			if (isProcessAlive(running.pid)) process.kill(running.pid, "SIGKILL");
			removeManifestIfOwnedBy(organization.id, running.pid);
			throw new CLIError(
				`Host service ${failure}`,
				"Run it under a supervisor that restarts on failure, e.g. systemd with Restart=on-failure and KillMode=process.",
			);
		}

		await terminateProcess(running.pid, { exited: running.exited });
		removeManifestIfOwnedBy(organization.id, running.pid);

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
