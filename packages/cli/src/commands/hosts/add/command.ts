import * as p from "@clack/prompts";
import {
	boolean,
	CLIError,
	isAgentMode,
	number,
	positional,
	string,
} from "@superset/cli-framework";
import type { ApiClient } from "../../../lib/api-client";
import { command } from "../../../lib/command";
import { resolveOrganization } from "../../../lib/resolve-org";
import { createProgress } from "./progress";
import {
	assertInstallable,
	buildProbeScript,
	buildSetupScript,
	parseHostId,
	parseProbe,
} from "./remoteScript";
import {
	describeSshTarget,
	parseSshTarget,
	runSshScript,
	type SshTarget,
	stderrHint,
} from "./ssh";

const DEFAULT_ONLINE_TIMEOUT_SEC = 90;
const POLL_INTERVAL_MS = 2000;

async function mintApiKey(api: ApiClient, label: string): Promise<string> {
	try {
		const { key } = await api.apiKey.create.mutate({
			name: `host: ${label}`,
		});
		return key;
	} catch (error) {
		throw new CLIError(
			"Could not create an API key for the new host",
			error instanceof Error ? error.message : String(error),
		);
	}
}

/**
 * The host registers itself the moment its relay tunnel opens, so this only
 * waits — it never claims. Returns the host's name once the cloud agrees it is
 * online, or null if the wait ran out.
 */
async function waitForOnline({
	api,
	organizationId,
	hostId,
	timeoutSec,
	signal,
}: {
	api: ApiClient;
	organizationId: string;
	hostId: string;
	timeoutSec: number;
	signal: AbortSignal;
}): Promise<string | null> {
	const deadline = Date.now() + timeoutSec * 1000;
	while (!signal.aborted) {
		const hosts = await api.host.list.query({ organizationId });
		const host = hosts.find((row) => row.id === hostId);
		if (host?.online) return host.name;
		if (Date.now() >= deadline) return null;
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
	return null;
}

function describePlan(
	target: SshTarget,
	install: boolean,
	organizationName: string,
): string {
	const steps = [
		install ? "install the Superset CLI" : "use the Superset CLI already there",
		"store a new API key",
		`start the host service and register it under ${organizationName}`,
	];
	return `On ${describeSshTarget(target)} this will ${steps.join(", ")}.`;
}

export default command({
	sandbox: false,
	description:
		"Set up a machine over SSH and connect it as a host, installing Superset if it is missing",
	args: [
		positional("target")
			.required()
			.desc("SSH destination, e.g. user@host or user@host:2222"),
	],
	options: {
		org: string().desc(
			"Organization to register the host under (id, slug, or name)",
		),
		identity: string().desc("SSH private key to authenticate with (ssh -i)"),
		port: number().desc("SSH port; overrides a :port in the target"),
		version: string().desc(
			"CLI version to install, e.g. 1.28.0; defaults to the latest release",
		),
		reinstall: boolean().desc("Reinstall even if Superset is already present"),
		allowSharedMachineId: boolean().desc(
			"Set up a machine whose /etc/machine-id is empty, accepting host id collisions",
		),
		timeout: number().desc(
			`Seconds to wait for the host to come online (default ${DEFAULT_ONLINE_TIMEOUT_SEC})`,
		),
		yes: boolean().desc("Skip the confirmation prompt"),
	},
	run: async ({ ctx, args, options, signal }) => {
		const target = parseSshTarget(args.target as string);
		const destination = describeSshTarget(target);

		// Registration under the wrong organization leaves the host unreachable
		// with no obvious cause, so this never falls back to the active org.
		const organization = await resolveOrganization(
			await ctx.api.user.myOrganizations.query(),
			options.org ?? process.env.SUPERSET_ORGANIZATION_ID,
		);

		// ssh asks for passwords and host-key confirmation on the tty, which
		// only exists when a human is watching.
		const interactive = Boolean(process.stdin.isTTY) && !isAgentMode();
		const ssh = {
			...(options.identity ? { identity: options.identity } : {}),
			...(options.port ? { port: options.port } : {}),
			batch: !interactive,
			signal,
		};

		const progress = createProgress(interactive);
		progress.intro(`superset hosts add (${organization.name})`);

		progress.start(`Checking ${destination}...`);
		const probed = await runSshScript(target, buildProbeScript(), ssh);
		if (probed.code !== 0) {
			progress.stop(`Could not reach ${destination}`);
			throw new CLIError(
				`ssh to ${destination} failed (exit ${probed.code})`,
				stderrHint(probed.stderr) ??
					(ssh.batch
						? "Non-interactive mode uses BatchMode=yes, so key-based auth and a known host key are required."
						: "Check the destination, the port, and your SSH key."),
			);
		}

		const probe = parseProbe(probed.stdout);
		const install = !probe.bin || Boolean(options.reinstall);
		progress.stop(
			probe.bin
				? `${destination}: ${probe.os} ${probe.arch}, Superset ${probe.version ?? "present"}`
				: `${destination}: ${probe.os} ${probe.arch}, Superset not installed`,
		);

		if (install) {
			assertInstallable(probe);
			if (!probe.hasCurl) {
				throw new CLIError(
					`curl is not installed on ${destination}`,
					"The installer needs curl. Install it there, then re-run.",
				);
			}
		}

		// getHostId() is an HMAC of /etc/machine-id, so every machine with an
		// empty one derives the same host id and they evict each other's relay
		// tunnel in a loop. Containers without systemd are the common case.
		if (probe.machineId === "empty" && !options.allowSharedMachineId) {
			throw new CLIError(
				`${destination} has an empty /etc/machine-id`,
				"Its host id would collide with every other such machine. Give it one (systemd-machine-id-setup), or pass --allow-shared-machine-id.",
			);
		}

		if (!options.yes) {
			if (!interactive) {
				throw new CLIError(
					"Confirmation required",
					`${describePlan(target, install, organization.name)} Re-run with --yes.`,
				);
			}
			progress.info(describePlan(target, install, organization.name));
			const confirmed = await p.confirm({ message: "Continue?" });
			if (p.isCancel(confirmed) || !confirmed) {
				return { data: { cancelled: true }, message: "Cancelled" };
			}
		}

		const apiKey = await mintApiKey(ctx.api, destination);

		progress.start(
			install
				? `Installing Superset on ${destination}...`
				: `Connecting ${destination}...`,
		);
		const setup = await runSshScript(
			target,
			buildSetupScript({
				bin: options.reinstall ? null : probe.bin,
				apiKey,
				organizationId: organization.id,
				...(options.version ? { version: options.version } : {}),
			}),
			ssh,
		);
		if (setup.code !== 0) {
			progress.stop(`Setup failed on ${destination}`);
			throw new CLIError(
				`Setting up ${destination} failed (exit ${setup.code})`,
				`${stderrHint(setup.stderr, 8) ?? "The remote script produced no output."}\n\nAn API key named "host: ${destination}" was created for this attempt and is now unused — revoke it in Settings if you do not retry.`,
			);
		}

		const hostId = parseHostId(setup.stdout);
		progress.stop(`Host service running on ${destination}`);

		progress.start("Waiting for the host to come online...");
		const hostName = await waitForOnline({
			api: ctx.api,
			organizationId: organization.id,
			hostId,
			timeoutSec: options.timeout ?? DEFAULT_ONLINE_TIMEOUT_SEC,
			signal,
		});

		if (!hostName) {
			progress.stop("Host is not online yet");
			progress.outro(
				`Check it with: superset hosts list --org ${organization.id}`,
			);
			return {
				data: { hostId, organizationId: organization.id, online: false },
				message: `Set up ${destination} (host ${hostId}), but it has not reached the relay yet`,
			};
		}

		progress.stop(`${hostName} is online`);
		progress.outro(
			`${hostName} is ready — it shows up in the app and in hosts list.`,
		);
		return {
			data: {
				hostId,
				hostName,
				organizationId: organization.id,
				online: true,
				installed: install,
			},
			message: `Connected ${hostName} (${destination}) to ${organization.name}`,
		};
	},
});
