import fs from "node:fs";
import path from "node:path";
import type { PluginConnectionRef } from "@superset/shared/plugins";
import { getBinDir, resolveSupersetHomeDir } from "./paths";
import { writeFileIfChanged } from "./write-file-if-changed";

/**
 * Live connections cached next to installed_plugins.json, because every writer
 * of agent config runs where the account is not reachable. A cache, never a
 * source of truth: a stale read costs the one-entry shape until the next sync.
 */
export function pluginConnectionsFilePath(): string {
	return path.join(resolveSupersetHomeDir(), "plugins", "connections.json");
}

export function readPluginConnections(
	file: string = pluginConnectionsFilePath(),
): PluginConnectionRef[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
	} catch {
		return [];
	}

	const rows = (parsed as { connections?: unknown })?.connections;
	if (!Array.isArray(rows)) return [];

	const connections: PluginConnectionRef[] = [];
	for (const row of rows as Record<string, unknown>[]) {
		if (typeof row?.connector !== "string" || !row.connector) continue;
		if (typeof row?.connectionId !== "string" || !row.connectionId) continue;
		connections.push({
			connector: row.connector,
			connectionId: row.connectionId,
			externalUserId:
				typeof row.externalUserId === "string" ? row.externalUserId : null,
			nickname: typeof row.nickname === "string" ? row.nickname : null,
			label: typeof row.label === "string" ? row.label : null,
		});
	}
	return connections;
}

export function writePluginConnections(
	connections: readonly PluginConnectionRef[],
	file: string = pluginConnectionsFilePath(),
): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	writeFileIfChanged(
		file,
		`${JSON.stringify({ connections }, null, 2)}\n`,
		0o600,
	);
}

/**
 * The managed shim rather than a bare `superset`: the agent runs this in its own
 * environment, which need not carry our bin dir on PATH. Absent on a cloud box —
 * the firewall adds a credential there and the CLI's own bearer is empty, so a
 * helper would print `Bearer ` and fail every call.
 */
export function mcpHeadersHelperCommand(): string | undefined {
	if (process.env.SUPERSET_SANDBOX_WORKSPACE_ID) return undefined;
	return `${path.join(getBinDir(), "superset")} auth mcp-headers`;
}
