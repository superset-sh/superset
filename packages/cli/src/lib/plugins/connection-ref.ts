import { CLIError } from "@superset/cli-framework";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The plugin to act on. Credentials now live on the connector a plugin names,
 * and a person holds one connection per connector — so the plugin name is the
 * handle again, and a connection id no longer identifies which plugin was
 * meant (one connector can back several).
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
			"Run: superset mcp tools --plugin <name>",
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
