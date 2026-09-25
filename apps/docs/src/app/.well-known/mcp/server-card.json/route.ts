import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
	createDocsMcpServer,
	DOCS_BASE_URL,
	DOCS_MCP_NAME,
	DOCS_MCP_VERSION,
} from "@/lib/docs-mcp-server";

async function listTools() {
	const server = createDocsMcpServer();
	const [serverTransport, clientTransport] =
		InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: "server-card", version: "1.0.0" });
	try {
		await client.connect(clientTransport);
		const { tools } = await client.listTools();
		return tools.map((tool) => ({
			name: tool.name,
			...(tool.title ? { title: tool.title } : {}),
			description: tool.description,
			...(tool.annotations ? { annotations: tool.annotations } : {}),
			inputSchema: tool.inputSchema,
		}));
	} finally {
		await client.close();
		await server.close();
	}
}

export async function GET(): Promise<Response> {
	const card = {
		name: DOCS_MCP_NAME,
		title: "Superset docs",
		icon: "https://superset.sh/apple-touch-icon.png",
		version: DOCS_MCP_VERSION,
		kind: "docs",
		description:
			"Read-only search and retrieval over the Superset documentation. Every page is also an MCP resource addressed by its canonical URL. No authentication.",
		serverUrl: `${DOCS_BASE_URL}/mcp`,
		transport: "streamable-http",
		documentationUrl: `${DOCS_BASE_URL}/mcp-server`,
		authentication: { type: "none" },
		capabilities: { tools: true, resources: true },
		tools: await listTools(),
	};

	return Response.json(card, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
