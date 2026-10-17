import * as p from "@clack/prompts";
import {
	boolean,
	CLIError,
	positional,
	string,
	wrapText,
} from "@superset/cli-framework";
import { CANONICAL_URLS } from "@superset/shared/constants";
import { getHostId, hostIdFromMachineId } from "@superset/shared/host-info";
import { type ApiClient, createApiClient } from "../../../lib/api-client";
import { command } from "../../../lib/command";
import { env } from "../../../lib/env";
import { resolveOrganizationFromContext } from "../../../lib/resolve-org";
import { shellQuote } from "../../../lib/shell-quote";
import {
	hostKeyName,
	revokeKeysNamed,
} from "../../../lib/ssh-host-setup/host-key";
import { log } from "../../../lib/ssh-host-setup/log";
import {
	MACHINE_ID_FIX,
	machineIdProblem,
} from "../../../lib/ssh-host-setup/machine-id";
import {
	checkPlatform,
	type HostTarget,
} from "../../../lib/ssh-host-setup/platform";
import {
	PROBE_SCRIPT,
	parseProbe,
	type RemoteFacts,
} from "../../../lib/ssh-host-setup/probe";
import {
	installServiceScript,
	serviceKind,
} from "../../../lib/ssh-host-setup/service";
import { SshSession } from "../../../lib/ssh-host-setup/ssh-session";

const INSTALL_URL = `${CANONICAL_URLS.MARKETING}/cli/install.sh`;
const ONLINE_TIMEOUT_MS = 120_000;

async function confirmStep(message: string, yes: boolean): Promise<boolean> {
	if (yes) return true;
	if (!process.stdin.isTTY) {
		throw new CLIError(`${message} Pass --yes to allow it without a prompt.`);
	}
	const answer = await p.confirm({
		message: wrapText(message, (process.stdout.columns || 80) - 4),
	});
	return !p.isCancel(answer) && answer;
}

async function install(
	ssh: SshSession,
	facts: RemoteFacts,
	yes: boolean,
): Promise<{ bin: string; installed: boolean }> {
	const wanted = env.VERSION === "0.0.0-dev" ? null : env.VERSION;
	if (facts.bin && facts.hostRuntime && (!wanted || facts.version === wanted)) {
		log.info(`Superset CLI ${facts.version ?? ""} found at ${facts.bin}`);
		return { bin: facts.bin, installed: false };
	}
	const action =
		facts.bin && facts.hostRuntime
			? `Update the Superset CLI on ${ssh.target} from ${facts.version ?? "an unknown version"} to ${wanted}?`
			: `Install the Superset CLI${wanted ? ` ${wanted}` : ""} on ${ssh.target} (into ~/superset)?`;
	if (!(await confirmStep(action, yes))) {
		throw new CLIError("Cancelled", "The host needs the Superset CLI to run.");
	}
	if (!facts.curl) {
		throw new CLIError(
			`curl is not installed on ${ssh.target}`,
			"Install curl there, then run this again.",
		);
	}
	const tag = wanted ? `cli-v${wanted}` : "latest";
	const exitCode = await ssh.stream(`set -e
script=$(mktemp)
trap 'rm -f "$script"' EXIT
curl -fsSL ${INSTALL_URL} -o "$script"
SUPERSET_HOME="$HOME/superset" SUPERSET_VERSION=${tag} sh "$script" --no-next-steps`);
	if (exitCode !== 0) {
		throw new CLIError(`Installing the Superset CLI on ${ssh.target} failed`);
	}
	return { bin: `${facts.home}/superset/bin/superset`, installed: true };
}

async function signIn({
	ssh,
	api,
	bin,
	organizationId,
	keyName,
}: {
	ssh: SshSession;
	api: ApiClient;
	bin: string;
	organizationId: string;
	keyName: string;
}): Promise<"signed-in" | "kept"> {
	const [whoami, me] = await Promise.all([
		ssh.run(`${shellQuote(bin)} auth whoami --json`),
		api.user.me.query(),
	]);
	if (whoami.exitCode === 0) {
		const remote = parseWhoami(whoami.stdout);
		if (remote?.userId === me.id && remote.organizationId === organizationId) {
			log.info(`Already signed in on ${ssh.target}`);
			return "kept";
		}
		log.info(
			`${ssh.target} is signed in as another account or organization; signing it in as you`,
		);
	}
	await revokeKeysNamed(api, keyName);
	const { key } = await api.apiKey.create.mutate({ name: keyName });
	const login = await ssh.run(
		`${shellQuote(bin)} auth login --api-key=- --organization ${shellQuote(organizationId)} --json`,
		`${key}\n`,
	);
	if (login.exitCode !== 0) {
		await revokeKeysNamed(api, keyName).catch(() => {});
		throw new CLIError(
			`Signing in on ${ssh.target} failed`,
			`${ssh.target} said: ${remoteError(login.stderr || login.stdout)}`,
		);
	}
	log.success(`Signed in on ${ssh.target} with the API key "${keyName}"`);
	return "signed-in";
}

function parseWhoami(
	output: string,
): { userId?: string; organizationId?: string } | null {
	try {
		return JSON.parse(output);
	} catch {
		return null;
	}
}

function remoteError(output: string): string {
	return output
		.split("\n")
		.map((line) => line.replace(/^\s*(Error|Hint):\s*/, "").trim())
		.filter(Boolean)
		.map((line) => (/[.!?]$/.test(line) ? line : `${line}.`))
		.join(" ");
}

async function enableLinger(ssh: SshSession, yes: boolean): Promise<void> {
	const keep = await confirmStep(
		`Keep the host running on ${ssh.target} after you log out of it? This enables lingering for your user (loginctl enable-linger), which can ask for sudo.`,
		yes,
	).catch(() => false);
	if (!keep) {
		log.warn(
			"The host stops when your last session on it ends. Enable it later with: loginctl enable-linger",
		);
		return;
	}
	const exitCode = await ssh.stream(
		`loginctl enable-linger 2>/dev/null || sudo loginctl enable-linger "$(id -un)"`,
		{ tty: true },
	);
	if (exitCode !== 0) {
		log.warn("Could not enable lingering; the host stops when you log out.");
	}
}

async function startHost({
	ssh,
	facts,
	target,
	bin,
	organizationId,
	updated,
	noService,
	yes,
}: {
	ssh: SshSession;
	facts: RemoteFacts;
	target: HostTarget;
	bin: string;
	organizationId: string;
	updated: boolean;
	noService: boolean;
	yes: boolean;
}): Promise<"systemd" | "launchd" | "daemon"> {
	const kind = serviceKind(target);
	const canService = kind === "launchd" || facts.systemd;
	if (noService || !canService) {
		if (!noService) {
			log.warn(
				`No systemd user session on ${ssh.target}, so the host runs as a plain background process and does not survive a reboot.`,
			);
		}
		if (updated) {
			await ssh.run(
				`${shellQuote(bin)} stop --org ${shellQuote(organizationId)}`,
			);
		}
		const started = await ssh.run(
			`${shellQuote(bin)} start --daemon --org ${shellQuote(organizationId)} --json`,
		);
		if (started.exitCode !== 0) {
			throw new CLIError(
				`Starting the host on ${ssh.target} failed`,
				started.stderr.trim() || started.stdout.trim(),
			);
		}
		return "daemon";
	}

	const result = await ssh.run(
		installServiceScript({
			kind,
			binPath: bin,
			organizationId,
			restart: updated,
		}),
	);
	if (result.exitCode !== 0) {
		throw new CLIError(
			`Installing the host service on ${ssh.target} failed`,
			result.stderr.trim() || result.stdout.trim(),
		);
	}
	const action = result.stdout.match(/action=(\w+)/)?.[1] ?? "started";
	log.success(
		`${kind === "systemd" ? "systemd user service" : "LaunchAgent"} ${action}`,
	);
	if (kind === "systemd" && facts.linger === false) {
		await enableLinger(ssh, yes);
	}
	return kind;
}

async function waitOnline(
	api: ApiClient,
	organizationId: string,
	hostId: string,
	signal: AbortSignal,
): Promise<{ name: string } | null> {
	const deadline = Date.now() + ONLINE_TIMEOUT_MS;
	while (Date.now() < deadline && !signal.aborted) {
		const hosts = await api.host.list.query({ organizationId }).catch(() => []);
		const host = hosts.find((row) => row.id === hostId);
		if (host?.online) return { name: host.name };
		await Bun.sleep(2_000);
	}
	return null;
}

export default command({
	sandbox: false,
	description:
		"Set up a machine you can reach over SSH as a host: install the CLI, sign it in, and keep it running",
	args: [
		positional("target")
			.required()
			.desc(
				"SSH destination, as you would pass it to ssh (user@box or a Host alias)",
			),
	],
	options: {
		org: string().desc("Organization (id, slug, or name); defaults to active"),
		name: string().desc("Name for the host; defaults to its hostname"),
		yes: boolean().desc("Install and enable without asking"),
		service: boolean().desc(
			"Run the host as a systemd user service or LaunchAgent (default). --no-service runs a plain background process that does not survive a reboot",
		),
	},
	run: async ({ ctx, args, options, signal }) => {
		const target = args.target as string;
		const yes = options.yes ?? false;
		const organization = await resolveOrganizationFromContext(
			ctx.api,
			ctx.config.organizationId,
			options.org,
		);
		const api = createApiClient({
			bearer: ctx.bearer,
			organizationId: organization.id,
		});

		p.intro(`superset hosts add ${target}`);
		const ssh = await SshSession.open(target);
		try {
			const probe = await ssh.run(PROBE_SCRIPT);
			if (probe.exitCode !== 0) {
				throw new CLIError(
					`Could not inspect ${target}`,
					probe.stderr.trim() || undefined,
				);
			}
			const facts = parseProbe(probe.stdout);

			const platform = checkPlatform(facts.system, facts.machine, facts.ldd);
			if (!platform.ok) {
				throw new CLIError(
					`${target} cannot run a Superset host: ${platform.reason}`,
				);
			}
			if (facts.system === "Linux") {
				const problem = machineIdProblem(facts.machineId);
				if (problem) throw new CLIError(problem, MACHINE_ID_FIX);
			} else if (!facts.machineId) {
				throw new CLIError(`Could not read the hardware UUID of ${target}`);
			}
			const hostId = hostIdFromMachineId(facts.machineId);
			if (hostId === getHostId()) {
				throw new CLIError(
					`${target} is this machine`,
					"This machine is already a host when the app or `superset start` runs here.",
				);
			}
			log.info(`${facts.hostname} (${platform.target}), host id ${hostId}`);

			const { bin, installed } = await install(ssh, facts, yes);

			const credential = await signIn({
				ssh,
				api,
				bin,
				organizationId: organization.id,
				keyName: hostKeyName(facts.hostname, hostId),
			});

			const runAs = await startHost({
				ssh,
				facts,
				target: platform.target,
				bin,
				organizationId: organization.id,
				updated: installed || credential === "signed-in",
				noService: options.service === false,
				yes,
			});

			const spinner = p.spinner();
			spinner.start(`Waiting for ${facts.hostname} to come online`);
			const online = await waitOnline(api, organization.id, hostId, signal);
			if (!online) {
				spinner.stop("The host did not come online");
				throw new CLIError(
					`${target} did not come online within ${ONLINE_TIMEOUT_MS / 1000}s`,
					runAs === "systemd"
						? `See its log with: ssh ${target} journalctl --user -u superset-host -n 50`
						: `Check it with: ssh ${target} ${bin} status`,
				);
			}
			spinner.stop(`${online.name} is online`);

			let name = online.name;
			if (options.name && options.name !== online.name) {
				await api.host.rename.mutate({ hostId, name: options.name });
				name = options.name;
			}

			if (facts.gh === null) {
				log.warn(
					`GitHub CLI is not installed on ${target}, so private repos will not clone there. Install gh, then run: ssh -t ${target} gh auth login`,
				);
			} else if (facts.gh === "signed-out") {
				log.warn(
					`GitHub CLI is not signed in on ${target}, so private repos will not clone there. Run: ssh -t ${target} gh auth login`,
				);
			}
			log.outro(
				`${name} is ready. Pick it as the host when you create a workspace.`,
			);

			return {
				data: {
					hostId,
					name,
					organizationId: organization.id,
					platform: platform.target,
					runsAs: runAs,
					credential,
				},
				message: `${name} (${hostId}) is online`,
			};
		} finally {
			await ssh.close();
		}
	},
});
