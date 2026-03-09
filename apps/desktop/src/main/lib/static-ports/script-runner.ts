import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ScriptPort } from "shared/types";

const execAsync = promisify(exec);

const EXEC_TIMEOUT_MS = 5000;

function validateScriptPort(entry: unknown): ScriptPort | null {
	if (typeof entry !== "object" || entry === null) return null;

	const obj = entry as Record<string, unknown>;

	if (typeof obj.port !== "number" || !Number.isInteger(obj.port)) return null;
	if (obj.port < 1 || obj.port > 65535) return null;

	const result: ScriptPort = { port: obj.port };

	if (typeof obj.name === "string" && obj.name.trim()) {
		result.name = obj.name.trim();
	}
	if (typeof obj.url === "string" && obj.url.trim()) {
		result.url = obj.url.trim();
	}
	if (typeof obj.pid === "number" && Number.isInteger(obj.pid)) {
		result.pid = obj.pid;
	} else if (typeof obj.pid === "string") {
		const parsed = Number.parseInt(obj.pid, 10);
		if (!Number.isNaN(parsed) && parsed > 0) {
			result.pid = parsed;
		}
	}

	return result;
}

/**
 * Run a custom port-check script and parse its JSON output.
 * Returns an empty array on any error (non-blocking).
 */
export async function runPortCheckScript(
	command: string,
	workspacePath: string,
): Promise<ScriptPort[]> {
	try {
		const { stdout } = await execAsync(command, {
			cwd: workspacePath,
			timeout: EXEC_TIMEOUT_MS,
			maxBuffer: 128 * 1024,
		});

		const trimmed = stdout.trim();
		if (!trimmed) return [];

		const parsed: unknown = JSON.parse(trimmed);
		if (!Array.isArray(parsed)) {
			console.warn("[PortCheckScript] Expected JSON array from check command");
			return [];
		}

		const ports: ScriptPort[] = [];
		for (let i = 0; i < parsed.length; i++) {
			const validated = validateScriptPort(parsed[i]);
			if (validated) {
				ports.push(validated);
			}
		}
		return ports;
	} catch (error) {
		console.warn("[PortCheckScript] Check command failed:", error);
		return [];
	}
}
