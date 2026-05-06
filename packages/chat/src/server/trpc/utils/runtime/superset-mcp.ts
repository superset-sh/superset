import { MCPClient } from "@mastra/mcp";

type MastraExtraTool = {
	execute?: (input: unknown, context?: unknown) => Promise<unknown> | unknown;
	[key: string]: unknown;
};

export async function getSupersetMcpTools(
	headers: () => Promise<Record<string, string>>,
	apiUrl: string,
): Promise<Record<string, MastraExtraTool>> {
	try {
		const h = await headers();
		if (!h.Authorization && !h.authorization) return {};

		const client = new MCPClient({
			id: `superset-mcp-${Date.now()}`,
			servers: {
				superset: {
					url: new URL(`${apiUrl}/api/agent/mcp`),
					fetch: async (url, init) => {
						const merged = new Headers(init?.headers);
						for (const [k, v] of Object.entries(await headers())) {
							merged.set(k, v);
						}
						return fetch(url, { ...init, headers: merged });
					},
				},
			},
		});

		return (await client.listTools()) as unknown as Record<
			string,
			MastraExtraTool
		>;
	} catch (error) {
		console.warn(
			"[superset-mcp] failed to load tools",
			error instanceof Error ? error.message : error,
		);
		return {};
	}
}
