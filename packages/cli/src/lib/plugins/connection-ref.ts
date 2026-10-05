import { CLIError } from "@superset/cli-framework";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The plugin to act on. Credentials live on the connector a plugin names, and
 * a connection id does not identify a plugin — one connector can back several.
 * So the plugin name is the handle, and an id picks between accounts on it:
 * `--plugin <name> --account <id>`.
 */
export function resolvePluginName(opts: {
	plugin?: string;
	connection?: string;
	pluginId?: string;
}): string {
	const legacy = opts.connection ?? opts.pluginId;
	if (!opts.plugin && legacy && UUID.test(legacy)) {
		throw new CLIError(
			"--connection takes a plugin name now, not a connection id.",
			"To pick an account, pass the id to --account: superset mcp tools --plugin <name> --account <id>",
		);
	}

	const name = opts.plugin ?? legacy;
	if (!name) {
		throw new CLIError(
			"Pass --plugin <name>.",
			"Run: superset plugins list  (the PLUGIN column holds the name)",
		);
	}
	return name;
}
