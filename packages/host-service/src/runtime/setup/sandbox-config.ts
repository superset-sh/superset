/**
 * Sandbox configuration for Docker-sandboxed workspaces.
 *
 * Parsed as the `sandbox` key of `.superset/config.json` through the same
 * three-tier merge as setup/teardown/run (see config.ts). Security rule:
 * `mounts` and `env` are honored only from machine-local sources (the user
 * override under ~/.superset/projects/ and config.local.json) — a cloned
 * repo must never be able to mount host paths into its own sandbox.
 */

export type SandboxNetworkMode = "bridge" | "none";

export interface SandboxResources {
	/** docker --cpus */
	cpus?: number;
	/** docker --memory (megabytes) */
	memoryMb?: number;
	/** docker --pids-limit */
	pidsLimit?: number;
}

export interface SandboxGitConfig {
	/** Shallow-clone depth for the sandbox git dir. Omit = full history. */
	cloneDepth?: number;
}

export interface SandboxConfig {
	/** Default false. New workspaces snapshot this at create time. */
	enabled?: boolean;
	/** Sandbox image reference. Defaults to the Superset sandbox image. */
	image?: string;
	/** OCI runtime name passed to docker --runtime (e.g. "runsc"). */
	runtime?: string;
	/** Default "bridge". "none" disables container networking entirely. */
	network?: SandboxNetworkMode;
	/** Container ports to publish on 127.0.0.1 at container create. */
	ports?: number[];
	resources?: SandboxResources;
	/** Extra bind mounts, "path" or "path:ro". Machine-local sources only. */
	mounts?: string[];
	/** Env var names forwarded from the host env. Machine-local sources only. */
	env?: string[];
	git?: SandboxGitConfig;
	/**
	 * Mount the host's agent config (~/.claude, ~/.claude.json, ~/.codex)
	 * read-write into the container so agents reuse host auth. Default true;
	 * disable to require in-container login.
	 */
	agentConfig?: boolean;
}

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

function invalid(source: string, message: string): null {
	console.error(`Invalid sandbox config at ${source}: ${message}`);
	return null;
}

function validatePositiveNumber(
	value: unknown,
	source: string,
	field: string,
	{ integer }: { integer: boolean },
): number | null | undefined {
	if (value === undefined) return undefined;
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value <= 0 ||
		(integer && !Number.isInteger(value))
	) {
		return invalid(
			source,
			`'${field}' must be a positive ${integer ? "integer" : "number"}`,
		);
	}
	return value;
}

function validateResources(
	value: unknown,
	source: string,
): SandboxResources | null | undefined {
	if (value === undefined) return undefined;
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return invalid(source, "'resources' must be an object");
	}
	const obj = value as Record<string, unknown>;
	const cpus = validatePositiveNumber(obj.cpus, source, "resources.cpus", {
		integer: false,
	});
	if (cpus === null) return null;
	const memoryMb = validatePositiveNumber(
		obj.memoryMb,
		source,
		"resources.memoryMb",
		{ integer: true },
	);
	if (memoryMb === null) return null;
	const pidsLimit = validatePositiveNumber(
		obj.pidsLimit,
		source,
		"resources.pidsLimit",
		{ integer: true },
	);
	if (pidsLimit === null) return null;
	return {
		...(cpus !== undefined && { cpus }),
		...(memoryMb !== undefined && { memoryMb }),
		...(pidsLimit !== undefined && { pidsLimit }),
	};
}

function validatePorts(
	value: unknown,
	source: string,
): number[] | null | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return invalid(source, "'ports' must be an array");
	const ports: number[] = [];
	for (const port of value) {
		if (
			typeof port !== "number" ||
			!Number.isInteger(port) ||
			port < 1 ||
			port > 65535
		) {
			return invalid(source, "'ports' entries must be integers in 1..65535");
		}
		if (!ports.includes(port)) ports.push(port);
	}
	return ports;
}

/**
 * Validate the `sandbox` value of one config source. Returns null when the
 * value is structurally invalid (rejecting the whole source, matching how
 * setup/teardown/run behave). `machineLocal` marks sources the repo cannot
 * ship (user override, config.local.json); `mounts`/`env` from any other
 * source are dropped with a warning rather than honored.
 */
export function validateSandboxConfig(
	value: unknown,
	source: string,
	options: { machineLocal: boolean },
): SandboxConfig | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return invalid(source, "'sandbox' must be an object");
	}
	const obj = value as Record<string, unknown>;
	const result: SandboxConfig = {};

	if (obj.enabled !== undefined) {
		if (typeof obj.enabled !== "boolean") {
			return invalid(source, "'enabled' must be a boolean");
		}
		result.enabled = obj.enabled;
	}
	// agentConfig bind-mounts the host user's live agent credentials
	// (~/.claude, ~/.codex, ...) into the container. A cloned repo must not be
	// able to turn that on for itself — same trust rule as mounts/env.
	if (obj.agentConfig !== undefined) {
		if (typeof obj.agentConfig !== "boolean") {
			return invalid(source, "'agentConfig' must be a boolean");
		}
		if (!options.machineLocal) {
			console.warn(
				`Ignoring sandbox 'agentConfig' from ${source}: only machine-local ` +
					"config (~/.superset/projects/... or config.local.json) may set it",
			);
		} else {
			result.agentConfig = obj.agentConfig;
		}
	}
	for (const field of ["image", "runtime"] as const) {
		const fieldValue = obj[field];
		if (fieldValue === undefined) continue;
		if (typeof fieldValue !== "string" || fieldValue.trim().length === 0) {
			return invalid(source, `'${field}' must be a non-empty string`);
		}
		result[field] = fieldValue.trim();
	}
	if (obj.network !== undefined) {
		if (obj.network !== "bridge" && obj.network !== "none") {
			return invalid(source, `'network' must be "bridge" or "none"`);
		}
		result.network = obj.network;
	}

	const ports = validatePorts(obj.ports, source);
	if (ports === null) return null;
	if (ports !== undefined) result.ports = ports;

	const resources = validateResources(obj.resources, source);
	if (resources === null) return null;
	if (resources !== undefined) result.resources = resources;

	if (obj.git !== undefined) {
		if (!obj.git || typeof obj.git !== "object" || Array.isArray(obj.git)) {
			return invalid(source, "'git' must be an object");
		}
		const cloneDepth = validatePositiveNumber(
			(obj.git as Record<string, unknown>).cloneDepth,
			source,
			"git.cloneDepth",
			{ integer: true },
		);
		if (cloneDepth === null) return null;
		result.git = cloneDepth !== undefined ? { cloneDepth } : {};
	}

	for (const field of ["mounts", "env"] as const) {
		const fieldValue = obj[field];
		if (fieldValue === undefined) continue;
		if (!isStringArray(fieldValue)) {
			return invalid(source, `'${field}' must be an array of strings`);
		}
		if (!options.machineLocal) {
			console.warn(
				`Ignoring sandbox '${field}' from ${source}: only machine-local ` +
					"config (~/.superset/projects/... or config.local.json) may set it",
			);
			continue;
		}
		if (field === "env") {
			for (const name of fieldValue) {
				if (!ENV_NAME_RE.test(name)) {
					return invalid(
						source,
						`'env' entry ${JSON.stringify(name)} is not a valid variable name`,
					);
				}
			}
		} else {
			for (const mount of fieldValue) {
				const path = mount.endsWith(":ro") ? mount.slice(0, -3) : mount;
				if (path.trim().length === 0 || !path.startsWith("/")) {
					return invalid(
						source,
						`'mounts' entry ${JSON.stringify(mount)} must be an absolute path, optionally ":ro"-suffixed`,
					);
				}
			}
		}
		result[field] = fieldValue;
	}

	return result;
}

/**
 * Per-field later-wins merge, one level deep for `resources`/`git`.
 * Arrays replace wholesale, matching setup/teardown/run semantics.
 */
export function mergeSandboxConfigs(
	base: SandboxConfig | undefined,
	override: SandboxConfig | undefined,
): SandboxConfig | undefined {
	if (!base) return override;
	if (!override) return base;
	const resources =
		base.resources || override.resources
			? { ...base.resources, ...override.resources }
			: undefined;
	const git =
		base.git || override.git ? { ...base.git, ...override.git } : undefined;
	return {
		enabled: override.enabled ?? base.enabled,
		image: override.image ?? base.image,
		runtime: override.runtime ?? base.runtime,
		network: override.network ?? base.network,
		ports: override.ports ?? base.ports,
		mounts: override.mounts ?? base.mounts,
		env: override.env ?? base.env,
		agentConfig: override.agentConfig ?? base.agentConfig,
		...(resources && { resources }),
		...(git && { git }),
	};
}
