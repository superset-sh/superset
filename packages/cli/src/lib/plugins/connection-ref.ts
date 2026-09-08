import { CLIError } from "@superset/cli-framework";

/**
 * The connection to act on, always named outright. Resolving a plugin name to
 * "its" connection used to be allowed, which made the id and the name two
 * handles for the same slot: a stray positional could land in the name slot
 * and be silently discarded in favour of the id, so a mistyped call ran a tool
 * nobody asked for. One handle, and it is the id.
 */
export function resolveConnectionId(opts: {
	connection?: string;
	pluginId?: string;
}): string {
	const id = opts.connection ?? opts.pluginId;
	if (!id) {
		throw new CLIError(
			"Pass --connection <id>.",
			"Run: superset plugins list  (the PLUGIN ID column holds the id, one per connected account)",
		);
	}
	return id;
}
