/**
 * Pure builders for docker CLI argv. Kept side-effect-free so create/exec
 * specs are snapshot-testable without a docker daemon.
 */

import type { SandboxConfig } from "../setup/sandbox-config.ts";

export interface MountSpec {
	source: string;
	target: string;
	readOnly?: boolean;
}

export interface PublishedPort {
	containerPort: number;
	hostPort: number;
}

export const MANAGED_LABEL = "com.superset.managed=true";
export const WORKSPACE_ID_LABEL = "com.superset.workspace-id";
export const CONFIG_HASH_LABEL = "com.superset.config-hash";
/**
 * Which host-service instance owns the container, keyed by its superset home
 * dir. Reconcile only touches containers with ITS OWN home label — a test
 * host or a second dev instance must never sweep another instance's
 * containers as orphans.
 */
export const OWNER_HOME_LABEL = "com.superset.home";

export interface ContainerCreateSpec {
	name: string;
	workspaceId: string;
	configHash: string;
	/** Superset home dir of the owning host-service (OWNER_HOME_LABEL). */
	ownerHome: string;
	image: string;
	runtime?: string;
	network: "bridge" | "none";
	resources: { cpus?: number; memoryMb?: number; pidsLimit: number };
	mounts: MountSpec[];
	/** Published on loopback only — never exposed beyond the host. */
	publishedPorts: PublishedPort[];
}

export function buildMountArgs(mounts: MountSpec[]): string[] {
	return mounts.flatMap((mount) => [
		"--mount",
		[
			"type=bind",
			`source=${mount.source}`,
			`target=${mount.target}`,
			...(mount.readOnly ? ["readonly"] : []),
		].join(","),
	]);
}

export function buildContainerCreateArgs(spec: ContainerCreateSpec): string[] {
	const { resources } = spec;
	return [
		"create",
		"--name",
		spec.name,
		"--hostname",
		spec.name,
		"--label",
		MANAGED_LABEL,
		"--label",
		`${WORKSPACE_ID_LABEL}=${spec.workspaceId}`,
		"--label",
		`${CONFIG_HASH_LABEL}=${spec.configHash}`,
		"--label",
		`${OWNER_HOME_LABEL}=${spec.ownerHome}`,
		"--restart",
		"unless-stopped",
		"--init",
		...(spec.runtime ? ["--runtime", spec.runtime] : []),
		...(spec.network === "none" ? ["--network", "none"] : []),
		...(resources.cpus ? ["--cpus", String(resources.cpus)] : []),
		...(resources.memoryMb ? ["--memory", `${resources.memoryMb}m`] : []),
		"--pids-limit",
		String(resources.pidsLimit),
		// Docker Desktop resolves host.docker.internal natively; host-gateway
		// pre-provisions the same name for Linux engines.
		"--add-host",
		"host.docker.internal:host-gateway",
		...spec.publishedPorts.flatMap((port) => [
			"-p",
			`127.0.0.1:${port.hostPort}:${port.containerPort}`,
		]),
		...buildMountArgs(spec.mounts),
		spec.image,
		"sleep",
		"infinity",
	];
}

export interface ExecSpec {
	containerName: string;
	cwd: string;
	env: Record<string, string>;
	command: string[];
}

/** argv for `docker <argv...>` — an interactive TTY exec into the sandbox. */
export function buildExecArgs(spec: ExecSpec): string[] {
	return [
		"exec",
		"-it",
		"-w",
		spec.cwd,
		...Object.entries(spec.env).flatMap(([key, value]) => [
			"-e",
			`${key}=${value}`,
		]),
		spec.containerName,
		...spec.command,
	];
}

/** Parse a config `mounts` entry ("path" | "path:ro") into a MountSpec. */
export function parseConfigMount(entry: string): MountSpec {
	const readOnly = entry.endsWith(":ro");
	const path = readOnly ? entry.slice(0, -3) : entry;
	return { source: path, target: path, ...(readOnly && { readOnly: true }) };
}

export interface ResolvedSandboxSettings {
	image: string;
	runtime?: string;
	network: "bridge" | "none";
	ports: number[];
	resources: { cpus?: number; memoryMb?: number; pidsLimit: number };
	extraMounts: MountSpec[];
	envPassthrough: string[];
	mountAgentConfig: boolean;
	cloneDepth?: number;
}

/** Locally-built tag (`bun run --cwd packages/sandbox-image build:image`). */
export const LOCAL_SANDBOX_IMAGE = "superset-sandbox:dev";
export const PUBLISHED_SANDBOX_IMAGE = "ghcr.io/superset-sh/sandbox:latest";
/**
 * Development builds default to the locally-built image — the published one
 * doesn't exist until the image CI ships, and dev machines build their own.
 */
export const DEFAULT_SANDBOX_IMAGE =
	process.env.NODE_ENV === "development"
		? LOCAL_SANDBOX_IMAGE
		: PUBLISHED_SANDBOX_IMAGE;
const DEFAULT_PIDS_LIMIT = 2048;

/** Apply defaults to a parsed SandboxConfig. */
export function resolveSandboxSettings(
	config: SandboxConfig,
): ResolvedSandboxSettings {
	return {
		image: config.image ?? DEFAULT_SANDBOX_IMAGE,
		...(config.runtime && { runtime: config.runtime }),
		network: config.network ?? "bridge",
		ports: config.ports ?? [],
		resources: {
			...(config.resources?.cpus && { cpus: config.resources.cpus }),
			...(config.resources?.memoryMb && {
				memoryMb: config.resources.memoryMb,
			}),
			pidsLimit: config.resources?.pidsLimit ?? DEFAULT_PIDS_LIMIT,
		},
		extraMounts: (config.mounts ?? []).map(parseConfigMount),
		envPassthrough: config.env ?? [],
		// Default OFF: mounting host agent credentials is opt-in via
		// machine-local config, so a repo-enabled sandbox never gets them.
		mountAgentConfig: config.agentConfig ?? false,
		...(config.git?.cloneDepth && { cloneDepth: config.git.cloneDepth }),
	};
}
