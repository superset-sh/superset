import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CLIError } from "@superset/cli-framework";
import { DEFAULT_MARKETPLACE } from "@superset/shared/plugins";
import { getApiUrl } from "../config";

export interface PluginRef {
	plugin: string;
	marketplace: string;
}

export function parsePluginRef(name: string): PluginRef {
	const at = name.lastIndexOf("@");
	if (at <= 0) return { plugin: name, marketplace: DEFAULT_MARKETPLACE };
	return {
		plugin: name.slice(0, at),
		marketplace: name.slice(at + 1),
	};
}

export function pluginMcpUrl(ref: PluginRef, connection?: string): URL {
	const url = new URL(
		`${getApiUrl()}/mcp/plugins/${encodeURIComponent(ref.marketplace)}/${encodeURIComponent(ref.plugin)}`,
	);
	if (connection) url.searchParams.set("connection", connection);
	return url;
}

export async function connectPluginMcp(
	name: string,
	bearer: string,
	connection?: string,
): Promise<{ client: Client; ref: PluginRef }> {
	const ref = parsePluginRef(name);
	const client = new Client({ name: "superset-cli", version: "1.0.0" });
	try {
		await client.connect(
			new StreamableHTTPClientTransport(pluginMcpUrl(ref, connection), {
				requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
			}),
		);
	} catch (error) {
		throw new CLIError(
			`Could not reach the "${ref.plugin}" plugin: ${error instanceof Error ? error.message : String(error)}`,
			"Run: superset plugins list  (check the plugin is installed and connected)",
		);
	}
	return { client, ref };
}
