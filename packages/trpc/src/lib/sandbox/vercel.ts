/**
 * Called directly rather than behind a provider interface: there is one
 * provider, so an interface would be a second thing to keep in sync with no
 * second implementation to justify it.
 *
 * The provider's part is compute, filesystem, the published ports and the
 * egress firewall. Ours is the box itself: identity written to a file, boot
 * started through the sandbox API with the host secret in its env, the
 * managed environment pushed into host-service once it answers, and a
 * ticket-checking gate in front of every port (`access.ts`).
 */

import {
	renderSandboxConf,
	SANDBOX_PATHS,
	SANDBOX_PORTS,
	SANDBOX_PUBLISHED_PORTS,
	type SandboxIdentity,
} from "@superset/shared/sandbox-contract";
import {
	APIError,
	type NetworkPolicy,
	Sandbox,
	type SandboxRegion,
} from "@vercel/sandbox";
import { env } from "../../env";

export const HOST_SERVICE_PORT = SANDBOX_PORTS.hostService;
export const DESKTOP_PORT = SANDBOX_PORTS.desktop;
/**
 * A session ends after this long; the workspace's files survive and the next
 * open resumes it. A workspace someone has open is extended before it gets
 * there (`wakeSandbox`), so this is really the idle stop, and how long an
 * unattended agent run can last.
 */
const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000;
/** Extend an open workspace's session when it has less than this left. */
const EXTEND_BELOW_MS = 60 * 60 * 1000;
const WORKSPACE_SNAPSHOT_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000;
/** 2 GB of memory per vCPU; disk is 64 GB regardless. */
const IMAGE_SANDBOX_VCPUS = 8;
const GOLDEN_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const BOOT_COMMAND = "/usr/local/bin/superset-boot";

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

export interface SandboxEnvironment {
	sourceKind: "image" | "fork";
	sourceRef: string;
}

/** Everything the box needs to become one workspace; nothing of it is a create-time env. */
export interface SandboxClaim {
	identity: SandboxIdentity;
	/** What the gate presents; travels only in the boot command's env. */
	hostSecret: string;
	managedEnv: Record<string, string>;
	networkPolicy: NetworkPolicy;
	/** Ports the workspace's repository asks to publish, beside the platform's. */
	ports?: readonly number[];
}

function publishedPorts(extra: readonly number[] = []): number[] {
	return [...new Set([...SANDBOX_PUBLISHED_PORTS, ...extra])];
}

/**
 * The identity file, written before boot on every create and wake: what a
 * person can read on the box to see which workspace it is. A file rather
 * than a variable on the boot command, so it can hold whatever the box needs
 * without a size limit and so the runner's inputs never change shape.
 */
async function writeIdentity(
	sandbox: Sandbox,
	identity: SandboxIdentity,
): Promise<void> {
	await sandbox.writeFiles([
		{
			path: SANDBOX_PATHS.conf,
			content: renderSandboxConf(identity),
			mode: 0o644,
		},
	]);
}

/**
 * Starts boot: root, detached, with the host secret in the command's env and
 * nowhere else. The platform's own `sudo: true` resets the env; the image's
 * sudoers grants SETENV, so the secret crosses into root without touching
 * argv. The runner refuses to stack a second host-service on a live one, so
 * a wake that races a wake is harmless.
 */
async function runBoot(sandbox: Sandbox, hostSecret: string): Promise<void> {
	await sandbox.runCommand({
		cmd: "sudo",
		args: ["--preserve-env=HOST_SERVICE_SECRET", BOOT_COMMAND],
		detached: true,
		env: { HOST_SERVICE_SECRET: hostSecret },
	});
}

/**
 * When the provider call that makes the sandbox started and returned, and
 * when boot was fired into it. Job-side clock; the boot runner's own phases
 * are stamped inside the sandbox and read off health.check.
 */
/**
 * Creates the sandbox, writes its identity and starts boot. Returns once the
 * sandbox's address exists, not once anything listens on it; `settleSandbox`
 * is how a caller waits for that. Idempotent on the name: a re-delivered
 * provision finds the sandbox it already made.
 */
export async function provisionSandbox(args: {
	name: string;
	environment: SandboxEnvironment;
	claim: SandboxClaim;
	/** A golden under construction keeps its snapshots until its row goes. */
	kind?: "workspace" | "environment";
}): Promise<{
	providerSandboxId: string;
	sandboxUrl: string;
	hostTarget: string;
	desktopTarget: string;
}> {
	const kind = args.kind ?? "workspace";
	const config = {
		...credentials(),
		name: args.name,
		ports: publishedPorts(args.claim.ports),
		timeout: SESSION_TIMEOUT_MS,
		env: {},
		networkPolicy: args.claim.networkPolicy,
		persistent: true,
		snapshotExpiration:
			kind === "environment" ? 0 : WORKSPACE_SNAPSHOT_EXPIRATION_MS,
		keepLastSnapshots: { count: 1 },
		tags: { kind },
	};
	const sandbox =
		(await getSandbox(args.name)) ??
		(args.environment.sourceKind === "fork"
			? // A fork copies the golden's resources and its region; a snapshot
				// only exists where it was taken.
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
	await writeIdentity(sandbox, args.claim.identity);
	await runBoot(sandbox, args.claim.hostSecret);
	return {
		providerSandboxId: args.name,
		sandboxUrl: sandbox.domain(HOST_SERVICE_PORT),
		hostTarget: sandbox.domain(HOST_SERVICE_PORT),
		desktopTarget: sandbox.domain(DESKTOP_PORT),
	};
}

const HOST_READY_TIMEOUT_MS = 60_000;
const HOST_READY_POLL_MS = 100;

export class SandboxNotReadyError extends Error {
	constructor(providerSandboxId: string) {
		super(`host-service in ${providerSandboxId} did not answer in time`);
		this.name = "SandboxNotReadyError";
	}
}

async function waitForHostService(
	target: string,
	providerSandboxId: string,
): Promise<void> {
	const deadline = Date.now() + HOST_READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const ok = await fetch(`${target}/trpc/health.check`, {
			signal: AbortSignal.timeout(HOST_READY_POLL_MS * 6),
		})
			.then((response) => response.ok)
			.catch(() => false);
		if (ok) return;
		await new Promise((resolve) => setTimeout(resolve, HOST_READY_POLL_MS));
	}
	throw new SandboxNotReadyError(providerSandboxId);
}

/**
 * The half of a wake after boot is fired: wait for host-service to answer,
 * then push the managed environment. What a create runs once its box is
 * booted, so it never re-runs the wake's own calls on a box it just made.
 */
export async function settleSandbox(args: {
	providerSandboxId: string;
	hostTarget: string;
	claim: SandboxClaim;
}): Promise<void> {
	await waitForHostService(args.hostTarget, args.providerSandboxId);
	await pushManagedEnv(
		args.hostTarget,
		args.claim.hostSecret,
		args.claim.managedEnv,
	);
}

/**
 * Replaces host-service's managed environment. Direct to the box with the
 * host secret, the way the gate would; superjson is host-service's wire
 * format, so the input is wrapped the way its client would wrap it.
 */
export async function pushManagedEnv(
	target: string,
	hostSecret: string,
	variables: Record<string, string>,
): Promise<void> {
	const response = await fetch(`${target}/trpc/sandbox.setEnvironment`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${hostSecret}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ json: { variables } }),
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) {
		throw new Error(`sandbox.setEnvironment answered ${response.status}`);
	}
}

/** The sandbox's addresses and whether a session is running, waking nothing. */
export async function describeSandbox(providerSandboxId: string): Promise<{
	hostTarget: string;
	desktopTarget: string;
	running: boolean;
}> {
	try {
		const sandbox = await Sandbox.get({
			...credentials(),
			name: providerSandboxId,
			resume: false,
		});
		return {
			hostTarget: sandbox.domain(HOST_SERVICE_PORT),
			desktopTarget: sandbox.domain(DESKTOP_PORT),
			running: sandbox.status === "running",
		};
	} catch (error) {
		if (isUnavailable(error))
			throw new SandboxUnavailableError(providerSandboxId, error);
		throw error;
	}
}

/**
 * Brings a workspace's box to serving and returns once host-service answers.
 *
 * A stopped session is resumed by the boot command itself (runCommand resumes
 * before it runs); a running one is extended so an open workspace never hits
 * the idle stop. Either way the identity is rewritten (a bundle pin may have
 * moved), the credential rules are re-applied (a token may have aged), and
 * the managed environment is pushed again (a fresh session holds none).
 */
export async function wakeSandbox(args: {
	providerSandboxId: string;
	claim: SandboxClaim;
}): Promise<{
	hostTarget: string;
	desktopTarget: string;
	wasRunning: boolean;
}> {
	try {
		const sandbox = await Sandbox.get({
			...credentials(),
			name: args.providerSandboxId,
			resume: false,
		});
		const hostTarget = sandbox.domain(HOST_SERVICE_PORT);
		const desktopTarget = sandbox.domain(DESKTOP_PORT);
		const wasRunning = sandbox.status === "running";
		if (wasRunning) {
			const remaining = (sandbox.expiresAt?.getTime() ?? 0) - Date.now();
			if (remaining < EXTEND_BELOW_MS) {
				// Past the plan's per-session cap the extension is refused; the
				// session then ends and the next open resumes it.
				await sandbox.extendTimeout(SESSION_TIMEOUT_MS).catch(() => {});
			}
		}
		// The policy goes out alongside the identity write: the first call to
		// touch a stopped session pays the resume, and the rules are in place
		// long before anything on the box makes a request.
		await Promise.all([
			sandbox
				.update({ networkPolicy: args.claim.networkPolicy })
				.catch((error) =>
					console.warn(
						`[sandbox] policy update failed for ${args.providerSandboxId}`,
						error,
					),
				),
			writeIdentity(sandbox, args.claim.identity),
		]);
		await runBoot(sandbox, args.claim.hostSecret);
		await settleSandbox({
			providerSandboxId: args.providerSandboxId,
			hostTarget,
			claim: args.claim,
		});
		return { hostTarget, desktopTarget, wasRunning };
	} catch (error) {
		if (isUnavailable(error))
			throw new SandboxUnavailableError(args.providerSandboxId, error);
		throw error;
	}
}

/**
 * Identity a workspace writes for itself on boot. A golden must carry none of
 * it, or every fork would come up as the promoted workspace.
 */
const INHERITED_IDENTITY = [
	SANDBOX_PATHS.conf,
	// A fork's logs start with its own boot, not the golden's.
	SANDBOX_PATHS.logs,
	SANDBOX_PATHS.hostDb,
	`${SANDBOX_PATHS.hostDb}-wal`,
	`${SANDBOX_PATHS.hostDb}-shm`,
	SANDBOX_PATHS.checkouts,
	`${SANDBOX_PATHS.state}/agent-launched`,
	`${SANDBOX_PATHS.state}/db-branch`,
	`${SANDBOX_PATHS.home}/.superset/host`,
	`${SANDBOX_PATHS.home}/.gitconfig`,
	`${SANDBOX_PATHS.workspace}/.env`,
];

/** Removes what a box wrote for the workspace it was, so a fork starts clean. */
export async function stripWorkspaceIdentity(sandbox: Sandbox): Promise<void> {
	await sandbox.runCommand({
		cmd: "rm",
		args: ["-rf", ...INHERITED_IDENTITY],
		sudo: true,
	});
}

/**
 * Stops a sandbox and returns once the snapshot forks would start from is
 * current. What a release does to a golden it has finished building.
 */
export async function stopAndSnapshot(name: string): Promise<void> {
	const sandbox = await Sandbox.get({ ...credentials(), name, resume: false });
	const before = sandbox.currentSnapshotId;
	await sandbox.stop();
	await waitForStopSnapshot(name, before);
}

/**
 * A golden is a stopped sandbox whose current snapshot is what forks start
 * from. It is built from a snapshot of the source taken now (a fork alone
 * would start from the source's last stop) and created with an empty env.
 * Taking that snapshot ends the source's session, so a running source is
 * started again before this returns.
 */
export async function promoteSandboxToEnvironment(args: {
	sourceSandbox: string;
	goldenName: string;
	/** What restarts the source: it boots the same way a wake does. */
	claim: SandboxClaim;
}): Promise<string> {
	const source = await Sandbox.get({
		...credentials(),
		name: args.sourceSandbox,
		resume: false,
	});
	const wasRunning = source.status === "running";
	const snapshot = await source.snapshot();
	const golden = await Sandbox.create({
		...credentials(),
		name: args.goldenName,
		source: { type: "snapshot", snapshotId: snapshot.snapshotId },
		ports: publishedPorts(),
		timeout: GOLDEN_SESSION_TIMEOUT_MS,
		region: source.region as SandboxRegion,
		...(source.vcpus ? { resources: { vcpus: source.vcpus } } : {}),
		env: {},
		persistent: true,
		snapshotExpiration: 0,
		keepLastSnapshots: { count: 1 },
		tags: { kind: "environment" },
	});
	await stripWorkspaceIdentity(golden);
	const created = golden.currentSnapshotId;
	await golden.stop();
	await waitForStopSnapshot(args.goldenName, created);
	if (wasRunning) {
		await writeIdentity(source, args.claim.identity);
		await runBoot(source, args.claim.hostSecret);
	}
	return args.goldenName;
}

/**
 * stop() returns while the sandbox is still `stopping`; a fork taken before
 * the stop's snapshot is current boots from whatever was current before.
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
		if (sandbox.status === "stopped" && current && current !== previous) return;
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
	throw new Error(`${name} did not snapshot in time`);
}

/**
 * Ends the session without waiting for its snapshot: what a failed create
 * does to the box it keeps, so it costs storage rather than compute until
 * someone resumes it to look or deletes it.
 */
export async function stopSandbox(providerSandboxId: string): Promise<void> {
	const sandbox = await getSandbox(providerSandboxId);
	if (!sandbox || sandbox.status !== "running") return;
	await sandbox.stop();
}

/** Best-effort: a sandbox already gone is the state we wanted. */
export async function deleteSandbox(providerSandboxId: string): Promise<void> {
	const sandbox = await getSandbox(providerSandboxId);
	if (!sandbox) return;
	// Snapshots outlive a sandbox by default and keep billing storage.
	await sandbox.delete({ deleteOrphanSnapshots: true });
}
