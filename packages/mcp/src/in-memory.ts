import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpContext } from "./auth";
import { createMcpServer } from "./server";

export async function createInMemoryMcpClient({
	organizationId,
	userId,
}: {
	organizationId: string;
	userId: string;
}): Promise<{ client: Client; cleanup: () => Promise<void> }> {
	const server = createMcpServer();
	const [serverTransport, clientTransport] =
		InMemoryTransport.createLinkedPair();

	// Inject auth context into every message from client → server
	const originalSend = clientTransport.send.bind(clientTransport);
	clientTransport.send = (message, options) =>
		originalSend(message, {
			...options,
			authInfo: {
				token: "internal",
				clientId: "slack-agent",
				scopes: ["mcp:full"],
				extra: {
					mcpContext: { userId, organizationId } satisfies McpContext,
				},
			},
		});

	await server.connect(serverTransport);

	const client = new Client({ name: "superset-internal", version: "1.0.0" });
	await client.connect(clientTransport);

	return {
		client,
		cleanup: async () => {
			await client.close();
			await server.close();
		},
	};
}
