import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 15_000;
const PULL_TIMEOUT_MS = 10 * 60_000;
const AVAILABILITY_CACHE_MS = 5_000;

/**
 * Env for invoking the docker CLI. host-service may be launched by the
 * desktop app with a minimal PATH that misses Docker Desktop's install
 * locations, so append the common ones.
 */
export function getDockerCliEnv(): Record<string, string> {
	const extraPaths = ["/usr/local/bin", "/opt/homebrew/bin"];
	const basePath = process.env.PATH || "/usr/bin:/bin";
	const path = [
		basePath,
		...extraPaths.filter((p) => !basePath.includes(p)),
	].join(":");
	const env: Record<string, string> = {
		PATH: path,
		HOME: process.env.HOME || homedir(),
	};
	for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG"]) {
		const value = process.env[key];
		if (value) env[key] = value;
	}
	return env;
}

export class DockerCliError extends Error {
	constructor(
		message: string,
		readonly stderr: string,
	) {
		super(message);
		this.name = "DockerCliError";
	}
}

async function docker(
	args: string[],
	options?: { timeoutMs?: number },
): Promise<string> {
	try {
		const { stdout } = await execFileAsync("docker", args, {
			env: getDockerCliEnv(),
			timeout: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
			maxBuffer: 16 * 1024 * 1024,
		});
		return stdout;
	} catch (error) {
		const stderr =
			error && typeof error === "object" && "stderr" in error
				? String((error as { stderr: unknown }).stderr)
				: "";
		const message = error instanceof Error ? error.message : String(error);
		throw new DockerCliError(
			stderr.trim() ? `docker ${args[0]}: ${stderr.trim()}` : message,
			stderr,
		);
	}
}

let availabilityCache: { at: number; result: DockerAvailability } | null = null;

export type DockerAvailability =
	| { ok: true; serverVersion: string }
	| { ok: false; error: string };

/** Probe the docker daemon, cached briefly so PTY bursts don't stack probes. */
export async function checkDockerAvailable(): Promise<DockerAvailability> {
	const now = Date.now();
	if (availabilityCache && now - availabilityCache.at < AVAILABILITY_CACHE_MS) {
		return availabilityCache.result;
	}
	let result: DockerAvailability;
	try {
		const out = await docker(["version", "--format", "{{.Server.Version}}"], {
			timeoutMs: 5_000,
		});
		result = { ok: true, serverVersion: out.trim() };
	} catch (error) {
		result = {
			ok: false,
			error:
				error instanceof DockerCliError && error.stderr.trim()
					? error.stderr.trim()
					: "Docker is not running. Start Docker Desktop (or the Docker daemon) and retry.",
		};
	}
	availabilityCache = { at: now, result };
	return result;
}

export function resetDockerAvailabilityCacheForTests(): void {
	availabilityCache = null;
}

export interface ContainerInspection {
	exists: boolean;
	running: boolean;
	labels: Record<string, string>;
	imageDigest: string | null;
}

export async function inspectContainer(
	name: string,
): Promise<ContainerInspection> {
	try {
		const out = await docker([
			"inspect",
			"--type",
			"container",
			"--format",
			'{"running":{{json .State.Running}},"labels":{{json .Config.Labels}},"image":{{json .Image}}}',
			name,
		]);
		const parsed = JSON.parse(out.trim()) as {
			running: boolean;
			labels: Record<string, string> | null;
			image: string | null;
		};
		return {
			exists: true,
			running: parsed.running,
			labels: parsed.labels ?? {},
			imageDigest: parsed.image ?? null,
		};
	} catch (error) {
		if (error instanceof DockerCliError && /No such/i.test(error.stderr)) {
			return { exists: false, running: false, labels: {}, imageDigest: null };
		}
		throw error;
	}
}

export async function imageExists(image: string): Promise<boolean> {
	try {
		await docker(["image", "inspect", "--format", "{{.Id}}", image]);
		return true;
	} catch (error) {
		if (error instanceof DockerCliError && /No such/i.test(error.stderr)) {
			return false;
		}
		throw error;
	}
}

export async function pullImage(image: string): Promise<void> {
	await docker(["pull", image], { timeoutMs: PULL_TIMEOUT_MS });
}

/** `docker create` with fully composed args; returns the container id. */
export async function createContainer(createArgs: string[]): Promise<string> {
	const out = await docker(createArgs, { timeoutMs: 60_000 });
	return out.trim();
}

export async function startContainer(name: string): Promise<void> {
	await docker(["start", name], { timeoutMs: 60_000 });
}

/**
 * Rename a container in place. Unlike remove+recreate, this preserves the
 * running container and its live `docker exec` (terminal) sessions. Returns
 * false if the source is gone or the target name is already taken, so the
 * caller can fall back to removal.
 */
export async function renameContainer(
	from: string,
	to: string,
): Promise<boolean> {
	try {
		await docker(["rename", from, to], { timeoutMs: 30_000 });
		return true;
	} catch (error) {
		if (error instanceof DockerCliError) return false;
		throw error;
	}
}

export async function removeContainer(name: string): Promise<void> {
	try {
		await docker(["rm", "-f", name], { timeoutMs: 60_000 });
	} catch (error) {
		if (error instanceof DockerCliError && /No such/i.test(error.stderr)) {
			return;
		}
		throw error;
	}
}

export interface ManagedContainer {
	name: string;
	workspaceId: string | null;
	/** OWNER_HOME_LABEL value; null on containers from before the label. */
	ownerHome: string | null;
	running: boolean;
}

/** All containers carrying the Superset managed label, running or not. */
/**
 * All container names labeled with this workspace id — authoritative lookup
 * for destroy/cleanup, since display names can drift (rename, slug change).
 */
export async function listWorkspaceContainerNames(
	workspaceId: string,
): Promise<string[]> {
	const out = await docker([
		"ps",
		"-a",
		"--filter",
		`label=com.superset.workspace-id=${workspaceId}`,
		"--format",
		"{{.Names}}",
	]);
	return out.split("\n").filter((name) => name.trim().length > 0);
}

export async function listManagedContainers(): Promise<ManagedContainer[]> {
	const out = await docker([
		"ps",
		"-a",
		"--filter",
		"label=com.superset.managed=true",
		"--format",
		'{"name":{{json .Names}},"state":{{json .State}},"labels":{{json .Labels}}}',
	]);
	const containers: ManagedContainer[] = [];
	for (const line of out.split("\n")) {
		if (!line.trim()) continue;
		try {
			const parsed = JSON.parse(line) as {
				name: string;
				state: string;
				labels: string;
			};
			const labelPairs = parsed.labels
				.split(",")
				.map((pair) => pair.split("="));
			const labelValue = (key: string) =>
				labelPairs.find(([k]) => k === key)?.[1] ?? null;
			containers.push({
				name: parsed.name,
				workspaceId: labelValue("com.superset.workspace-id"),
				ownerHome: labelValue("com.superset.home"),
				running: parsed.state === "running",
			});
		} catch {
			// Skip unparseable lines rather than failing the whole listing.
		}
	}
	return containers;
}
