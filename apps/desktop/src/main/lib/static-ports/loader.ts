import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PORTS_FILE_NAME, PROJECT_SUPERSET_DIR_NAME } from "shared/constants";
import type { StaticPortsResult } from "shared/types";

interface PortEntry {
	port: unknown;
	label: unknown;
	url?: unknown;
}

interface PortsConfig {
	ports: unknown;
	check?: unknown;
}

/**
 * Validate a single port entry from the ports.json configuration.
 *
 * @param entry - The port entry object to validate
 * @param index - The index of the entry in the ports array (for error messages)
 * @returns Validation result with either the validated port/label or an error message
 */
function validatePortEntry(
	entry: PortEntry,
	index: number,
):
	| { valid: true; port: number; label: string; url?: string }
	| { valid: false; error: string } {
	if (typeof entry !== "object" || entry === null) {
		return { valid: false, error: `ports[${index}] must be an object` };
	}

	if (!("port" in entry)) {
		return {
			valid: false,
			error: `ports[${index}] is missing required field 'port'`,
		};
	}

	if (!("label" in entry)) {
		return {
			valid: false,
			error: `ports[${index}] is missing required field 'label'`,
		};
	}

	const { port, label } = entry;

	if (typeof port !== "number" || !Number.isInteger(port)) {
		return { valid: false, error: `ports[${index}].port must be an integer` };
	}

	if (port < 1 || port > 65535) {
		return {
			valid: false,
			error: `ports[${index}].port must be between 1 and 65535`,
		};
	}

	if (typeof label !== "string") {
		return { valid: false, error: `ports[${index}].label must be a string` };
	}

	if (label.trim() === "") {
		return { valid: false, error: `ports[${index}].label cannot be empty` };
	}

	const result: { valid: true; port: number; label: string; url?: string } = {
		valid: true,
		port,
		label: label.trim(),
	};

	if ("url" in entry && entry.url !== undefined) {
		if (typeof entry.url !== "string") {
			return {
				valid: false,
				error: `ports[${index}].url must be a string`,
			};
		}
		if (entry.url.trim() === "") {
			return {
				valid: false,
				error: `ports[${index}].url cannot be empty`,
			};
		}
		result.url = entry.url.trim();
	}

	return result;
}

/**
 * Load and validate static ports configuration from a worktree's .superset/ports.json file.
 *
 * @param worktreePath - Path to the workspace's worktree directory
 * @returns StaticPortsResult with exists flag, ports array, and any error message
 */
export function loadStaticPorts(worktreePath: string): StaticPortsResult {
	const portsPath = join(
		worktreePath,
		PROJECT_SUPERSET_DIR_NAME,
		PORTS_FILE_NAME,
	);

	if (!existsSync(portsPath)) {
		return { exists: false, ports: null, check: null, error: null };
	}

	let content: string;
	try {
		content = readFileSync(portsPath, "utf-8");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			exists: true,
			ports: null,
			check: null,
			error: `Failed to read ports.json: ${message}`,
		};
	}

	let parsed: PortsConfig;
	try {
		parsed = JSON.parse(content) as PortsConfig;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			exists: true,
			ports: null,
			check: null,
			error: `Invalid JSON in ports.json: ${message}`,
		};
	}

	if (typeof parsed !== "object" || parsed === null) {
		return {
			exists: true,
			ports: null,
			check: null,
			error: "ports.json must contain a JSON object",
		};
	}

	if (!("ports" in parsed)) {
		return {
			exists: true,
			ports: null,
			check: null,
			error: "ports.json is missing required field 'ports'",
		};
	}

	if (!Array.isArray(parsed.ports)) {
		return {
			exists: true,
			ports: null,
			check: null,
			error: "'ports' field must be an array",
		};
	}

	// Validate optional 'check' field
	let check: string | null = null;
	if ("check" in parsed && parsed.check !== undefined) {
		if (typeof parsed.check !== "string") {
			return {
				exists: true,
				ports: null,
				check: null,
				error: "'check' field must be a string",
			};
		}
		if (parsed.check.trim() === "") {
			return {
				exists: true,
				ports: null,
				check: null,
				error: "'check' field cannot be empty",
			};
		}
		check = parsed.check.trim();
	}

	const validatedPorts: Array<{ port: number; label: string; url?: string }> =
		[];

	for (let i = 0; i < parsed.ports.length; i++) {
		const entry = parsed.ports[i] as PortEntry;
		const result = validatePortEntry(entry, i);

		if (!result.valid) {
			return { exists: true, ports: null, check: null, error: result.error };
		}

		const portEntry: { port: number; label: string; url?: string } = {
			port: result.port,
			label: result.label,
		};
		if (result.url) {
			portEntry.url = result.url;
		}
		validatedPorts.push(portEntry);
	}

	return { exists: true, ports: validatedPorts, check, error: null };
}

/**
 * Check if a static ports configuration file exists for a worktree.
 *
 * @param worktreePath - Path to the workspace's worktree directory
 * @returns true if .superset/ports.json exists
 */
export function hasStaticPortsConfig(worktreePath: string): boolean {
	const portsPath = join(
		worktreePath,
		PROJECT_SUPERSET_DIR_NAME,
		PORTS_FILE_NAME,
	);
	return existsSync(portsPath);
}
