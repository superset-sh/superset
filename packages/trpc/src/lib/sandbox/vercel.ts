/**
 * Called directly rather than behind a provider interface: there is one
 * provider, so an interface would be a second thing to keep in sync with no
 * second implementation to justify it.
 *
 * A sandbox's exposed port is a public URL with nothing in front of it, so
 * the provider's part is compute, filesystem and the egress firewall only.
 * Access control is ours: host-service checks a token this API signs
 * (`access.ts`). Clients connect directly, no relay hop, so websockets work.
 */

import { SANDBOX_CREDENTIAL_PLACEHOLDER } from "@superset/shared/constants";
import {
	APIError,
	type NetworkPolicy,
	Sandbox,
	type SandboxRegion,
} from "@vercel/sandbox";
import { env } from "../../env";

const HOST_SERVICE_PORT = 4879;
/**
 * A session ends after this long; the workspace's files survive and the next
 * open resumes it. A workspace someone has open is extended before it gets
 * there (`resolveSandboxAddress`), so this is really the idle stop — and how long an
 * unattended agent run can last.
 */
const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000;
/** Extend an open workspace's session when it has less than this left. */
const EXTEND_BELOW_MS = 60 * 60 * 1000;
const WORKSPACE_SNAPSHOT_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000;
/** 2 GB of memory per vCPU; disk is 64 GB regardless. */
const IMAGE_SANDBOX_VCPUS = 8;
const GOLDEN_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
/**
 * The platform caps a sandbox's config env at 4 KB, which the identity and
 * credentials fit in and an environment's variables do not. Those travel as
 * this file instead: written root-only right after create, sourced by
 * /app/start.sh on every boot, and removed from a golden at promote.
 */
const ENVIRONMENT_FILE = "/data/environment.env";
const CONFIG_ENV_LIMIT_BYTES = 4096;

/** `KEY='value'` lines a POSIX shell sources; a quote inside becomes `'\''`. */
function shellEnvFile(envs: Record<string, string>): string {
	return Object.entries(envs)
		.map(([key, value]) => `${key}='${value.replaceAll("'", "'\\''")}'`)
		.join("\n")
		.concat("\n");
}

async function writeEnvironmentFile(
	sandbox: Sandbox,
	envs: Record<string, string>,
): Promise<void> {
	await sandbox.writeFiles([
		{ path: ENVIRONMENT_FILE, content: shellEnvFile(envs), mode: 0o600 },
	]);
}

function credentials() {
	return {
		token: env.VERCEL_SANDBOX_TOKEN,
		teamId: env.VERCEL_SANDBOX_TEAM_ID,
		projectId: env.VERCEL_SANDBOX_PROJECT_ID,
	};
}

function isNotFound(error: unknown): boolean {
	return error instanceof APIError && error.response.status === 404;
}

/**
 * The sandbox cannot serve this workspace again: deleted out from under the
 * row, or its snapshots expired so a stopped session has nothing to resume
 * from (the platform answers 410). The row is what the caller should fail.
 */
export class SandboxUnavailableError extends Error {
	constructor(
		readonly providerSandboxId: string,
		cause: unknown,
	) {
		super(`Sandbox ${providerSandboxId} is unavailable`, { cause });
	}
}

function isUnavailable(error: unknown): boolean {
	return (
		error instanceof APIError &&
		(error.response.status === 404 || error.response.status === 410)
	);
}

async function getSandbox(name: string): Promise<Sandbox | null> {
	try {
		return await Sandbox.get({ ...credentials(), name, resume: false });
	} catch (error) {
		if (isNotFound(error)) return null;
		throw error;
	}
}

interface BrokeredProvider {
	/** Any of these in the workspace env means the workspace brings its own. */
	provided: string[];
	placeholder: string;
	domain: string;
	headers: Record<string, string>;
}

/**
 * The organization's model keys, injected into egress at the firewall so they
 * never enter the sandbox: the agent sends a placeholder, the firewall swaps
 * the header. A workspace that carries its own credential for a provider — an
 * environment variable or the person's own sign-in — gets no rule for it, so
 * that credential is what reaches the provider untouched.
 */
function agentCredentialPolicy(workspaceEnv: Record<string, string>): {
	envs: Record<string, string>;
	networkPolicy: NetworkPolicy;
} {
	const providers: BrokeredProvider[] = [
		{
			provided: ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"],
			placeholder: "ANTHROPIC_API_KEY",
			domain: "api.anthropic.com",
			headers: { "x-api-key": env.ANTHROPIC_API_KEY },
		},
		{
			provided: ["OPENAI_API_KEY"],
			placeholder: "OPENAI_API_KEY",
			domain: "api.openai.com",
			headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
		},
	];
	const envs: Record<string, string> = {};
	const allow: Record<
		string,
		Array<{ transform: Array<{ headers: Record<string, string> }> }>
	> = {};
	for (const provider of providers) {
		if (provider.provided.some((name) => workspaceEnv[name])) continue;
		if (!Object.values(provider.headers).every(Boolean)) continue;
		// Unset reads as "not logged in" and produces no request to rewrite.
		envs[provider.placeholder] = SANDBOX_CREDENTIAL_PLACEHOLDER;
		allow[provider.domain] = [{ transform: [{ headers: provider.headers }] }];
	}
	if (Object.keys(allow).length === 0) {
		return { envs, networkPolicy: "allow-all" };
	}
	// The catch-all keeps the rest of the internet reachable; without it a
	// custom policy denies everything it does not list.
	return { envs, networkPolicy: { allow: { ...allow, "*": [] } } };
}

export interface ProvisionedSandbox {
	providerSandboxId: string;
	sandboxUrl: string;
}

export interface SandboxEnvironment {
	sourceKind: "image" | "fork";
	sourceRef: string;
}

/**
 * Starts host-service unless something already answers on its port — a wake
 * that races another wake, or a re-delivered provision, must not stack a
 * second server that dies on bind. Not awaited: the client discovers the
 * result through the health endpoint it already polls.
 */
async function startHostService(sandbox: Sandbox): Promise<void> {
	await sandbox.runCommand({
		cmd: "sh",
		args: [
			"-c",
			`nc -z 127.0.0.1 ${HOST_SERVICE_PORT} 2>/dev/null || exec /app/start.sh`,
		],
		detached: true,
	});
}

/**
 * Creates the sandbox and returns once its URL exists — not once anything is
 * listening on it, which is the caller's job. Idempotent on the name: a
 * re-delivered provision finds the sandbox it already made.
 */
export async function provisionSandbox(args: {
	name: string;
	environment: SandboxEnvironment;
	/**
	 * The workspace's identity and credentials — what the sandbox reads on
	 * boot to seed its own project and workspace rows, which is why
	 * provisioning has nothing to run inside it afterwards. Small by
	 * construction; it rides in the sandbox's config env.
	 */
	workspaceEnv: Record<string, string>;
	/** The environment's variables, delivered as a file (see ENVIRONMENT_FILE). */
	environmentEnv: Record<string, string>;
}): Promise<ProvisionedSandbox> {
	const { envs: credentialEnvs, networkPolicy } = agentCredentialPolicy({
		...args.environmentEnv,
		...args.workspaceEnv,
	});
	const configEnv = { ...credentialEnvs, ...args.workspaceEnv };
	const configEnvBytes = Buffer.byteLength(JSON.stringify(configEnv));
	if (configEnvBytes > CONFIG_ENV_LIMIT_BYTES) {
		throw new Error(
			`Sandbox identity env is ${configEnvBytes} bytes; the platform allows ${CONFIG_ENV_LIMIT_BYTES}`,
		);
	}
	const config = {
		...credentials(),
		name: args.name,
		ports: [HOST_SERVICE_PORT],
		timeout: SESSION_TIMEOUT_MS,
		env: configEnv,
		networkPolicy,
		persistent: true,
		snapshotExpiration: WORKSPACE_SNAPSHOT_EXPIRATION_MS,
		keepLastSnapshots: { count: 1 },
		tags: { kind: "workspace" },
	};

	const sandbox =
		(await getSandbox(args.name)) ??
		(args.environment.sourceKind === "fork"
			? // A fork copies the golden's resources and its region — a snapshot
				// only exists where it was taken; only its env is ours.
				await Sandbox.fork({
					...config,
					sourceSandbox: args.environment.sourceRef,
				})
			: await Sandbox.create({
					...config,
					image: args.environment.sourceRef,
					region: env.VERCEL_SANDBOX_REGION as SandboxRegion,
					resources: { vcpus: IMAGE_SANDBOX_VCPUS },
				}));

	const sandboxUrl = sandbox.domain(HOST_SERVICE_PORT);
	// Before the boot script, which sources it; a re-delivered provision
	// rewrites the same content.
	await writeEnvironmentFile(sandbox, args.environmentEnv);
	await startHostService(sandbox);
	return { providerSandboxId: args.name, sandboxUrl };
}

/**
 * The sandbox's address, and — when asked — a running host-service behind it.
 *
 * Addressing is a control-plane read that wakes nothing, so a client may hold
 * a live address for every workspace it lists. Waking is deliberate: a
 * stopped session is resumed and host-service started again (a new session
 * boots from the filesystem snapshot with no processes), and a running one is
 * extended so an open workspace never hits the idle stop.
 */
export async function resolveSandboxAddress(args: {
	providerSandboxId: string;
	wake: boolean;
}): Promise<{
	url: string;
	/**
	 * Whether a session was running before this call. A stopped sandbox's
	 * URL answers nothing until it is woken, so a client that fans requests
	 * out to every sandbox it lists must skip the ones that are not.
	 */
	running: boolean;
}> {
	try {
		const sandbox = await Sandbox.get({
			...credentials(),
			name: args.providerSandboxId,
			resume: false,
		});
		const url = sandbox.domain(HOST_SERVICE_PORT);
		const running = sandbox.status === "running";
		if (!args.wake) return { url, running };

		if (running) {
			const remaining = (sandbox.expiresAt?.getTime() ?? 0) - Date.now();
			if (remaining < EXTEND_BELOW_MS) {
				// Past the plan's per-session cap the extension is refused; the
				// session then ends and the next open resumes it, which is the
				// documented shape, not a failure worth surfacing here.
				await sandbox.extendTimeout(SESSION_TIMEOUT_MS).catch(() => {});
			}
			return { url, running };
		}
		// runCommand resumes a stopped session before it runs.
		await startHostService(sandbox);
		return { url, running };
	} catch (error) {
		if (isUnavailable(error)) {
			throw new SandboxUnavailableError(args.providerSandboxId, error);
		}
		throw error;
	}
}

/**
 * Identity a workspace writes for itself on boot. A golden must carry none of
 * it, or every fork would come up as the promoted workspace.
 */
const INHERITED_IDENTITY = [
	ENVIRONMENT_FILE,
	"/data/host.db",
	"/data/host.db-wal",
	"/data/host.db-shm",
	"/data/.workspace-bootstrapped",
	"/data/.sandbox-agent-launched",
	"/data/.superset-db-branch",
	"/root/.superset/host",
	"/root/.gitconfig",
];

/**
 * A golden is a stopped sandbox whose current snapshot is what forks start
 * from. It is built from a snapshot of the source taken now — a fork alone
 * would start from the source's last *stop*, not its live filesystem — and
 * created with an empty env: the source's identity, git token and agent
 * credentials are configuration, not files, so leaving them out is all it
 * takes to not inherit them.
 *
 * Taking that snapshot ends the source's session (measured: the workspace is
 * `stopped` afterwards), so a workspace that was running is started again
 * before this returns; whoever has it open sees a reconnect, not a dead
 * workspace.
 */
export async function promoteSandboxToEnvironment(args: {
	sourceSandbox: string;
	goldenName: string;
}): Promise<string> {
	const source = await Sandbox.get({
		...credentials(),
		name: args.sourceSandbox,
		resume: false,
	});
	const wasRunning = source.status === "running";
	// Ends the source's session; see below for why it is kept.
	const snapshot = await source.snapshot();
	const golden = await Sandbox.create({
		...credentials(),
		name: args.goldenName,
		source: { type: "snapshot", snapshotId: snapshot.snapshotId },
		ports: [HOST_SERVICE_PORT],
		timeout: GOLDEN_SESSION_TIMEOUT_MS,
		region: source.region as SandboxRegion,
		...(source.vcpus ? { resources: { vcpus: source.vcpus } } : {}),
		env: {},
		persistent: true,
		// Goldens are kept until the environment that points at them goes.
		snapshotExpiration: 0,
		keepLastSnapshots: { count: 1 },
		tags: { kind: "environment" },
	});
	await golden.runCommand("rm", ["-rf", ...INHERITED_IDENTITY]);
	// The stop is the snapshot forks will start from.
	const created = golden.currentSnapshotId;
	await golden.stop();
	await waitForStopSnapshot(args.goldenName, created);
	// The live snapshot is now the source's own current snapshot — what its
	// next resume boots from — so it stays; deleting it strands the workspace
	// (measured: `410 no snapshot available`). Retention evicts it on the
	// source's next stop.
	if (wasRunning) await startHostService(source);
	return args.goldenName;
}

/**
 * stop() returns while the sandbox is still `stopping`; a fork taken before
 * the stop's snapshot is current boots from whatever was current before —
 * for a sandbox that has never stopped, nothing but the image.
 */
export async function waitForStopSnapshot(
	name: string,
	previous: string | undefined,
): Promise<void> {
	const deadline = Date.now() + 3 * 60 * 1000;
	while (Date.now() < deadline) {
		const sandbox = await Sandbox.get({
			...credentials(),
			name,
			resume: false,
		});
		const current = sandbox.currentSnapshotId;
		if (sandbox.status === "stopped" && current && current !== previous) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
	throw new Error(`${name} did not snapshot in time`);
}

/** Best-effort: a sandbox already gone is the state we wanted. */
export async function deleteSandbox(providerSandboxId: string): Promise<void> {
	const sandbox = await getSandbox(providerSandboxId);
	if (!sandbox) return;
	// Snapshots outlive a sandbox by default and keep billing storage.
	await sandbox.delete({ deleteOrphanSnapshots: true });
}
