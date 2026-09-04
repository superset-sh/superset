import { CLIError } from "@superset/cli-framework";
import type { ApiClient } from "../api-client";

/**
 * The connection to act on: an explicit id, or the single connection a plugin
 * name resolves to. A name with several connected accounts is a question for
 * the caller, not a guess.
 */
export async function resolveConnectionId(
	api: ApiClient,
	opts: { connection?: string; plugin?: string },
): Promise<string> {
	if (opts.connection) return opts.connection;
	if (!opts.plugin) {
		throw new CLIError(
			"Name a plugin, or pass --connection <id>.",
			"Run: superset plugins list  (the PLUGIN ID column holds the id)",
		);
	}

	const connections = await api.plugins.connections.list.query({
		plugin: opts.plugin,
	});
	if (connections.length === 0) {
		throw new CLIError(
			`"${opts.plugin}" is not connected. Connect an account first.`,
			`Run: superset plugins connect ${opts.plugin}`,
		);
	}
	if (connections.length > 1) {
		const accounts = connections
			.map(
				(row) => `  --connection ${row.id}   (${row.account ?? row.accountId})`,
			)
			.join("\n");
		throw new CLIError(
			`"${opts.plugin}" has ${connections.length} connected accounts; choose one:\n${accounts}`,
		);
	}
	return connections[0]?.id as string;
}
