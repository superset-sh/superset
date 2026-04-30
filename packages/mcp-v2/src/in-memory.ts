import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mintUserJwt } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { members, users } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import type { McpContext } from "./auth";
import { createMcpServer } from "./server";

export interface InMemoryClientOptions {
	userId: string;
	organizationId: string;
	clientLabel: string;
	relayUrl: string;
}

/**
 * Build an in-memory MCP client/server pair for server-side agent integrations
 * (the Slack agent, the automations dispatcher, etc.). Auth context is wired
 * directly through the SDK's documented `authInfo` option on each request —
 * no transport monkey-patching.
 *
 * Callers MUST await the returned `cleanup()` to free the in-memory transport.
 * Use it inside a `try/finally` or with `await using` if your runtime supports it.
 */
export async function createInMemoryMcpClient({
	userId,
	organizationId,
	clientLabel,
	relayUrl,
}: InMemoryClientOptions): Promise<{
	client: Client;
	cleanup: () => Promise<void>;
}> {
	const [user] = await db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user) {
		throw new Error(`User ${userId} not found`);
	}
	const memberships = await db
		.select({ organizationId: members.organizationId })
		.from(members)
		.where(eq(members.userId, userId));
	const organizationIds = [
		...new Set(memberships.map((m) => m.organizationId)),
	];
	if (!organizationIds.includes(organizationId)) {
		throw new Error(
			`User ${userId} is not a member of organization ${organizationId}`,
		);
	}

	const bearerToken = await mintUserJwt({
		userId,
		email: user.email,
		organizationIds,
		ttlSeconds: 300,
	});

	const mcpContext: McpContext = {
		userId,
		email: user.email,
		organizationId,
		organizationIds,
		source: "api-key",
		clientLabel,
		requestId: crypto.randomUUID(),
		bearerToken,
		relayUrl,
	};

	const server = createMcpServer();
	const [serverTransport, clientTransport] =
		InMemoryTransport.createLinkedPair();

	const originalSend = clientTransport.send.bind(clientTransport);
	clientTransport.send = (message, options) =>
		originalSend(message, {
			...options,
			authInfo: {
				token: "internal",
				clientId: "mcp-v2-internal",
				scopes: ["mcp:full"],
				extra: { mcpContext },
			},
		});

	await server.connect(serverTransport);

	const client = new Client({
		name: "superset-v2-internal",
		version: "1.0.0",
	});
	await client.connect(clientTransport);

	return {
		client,
		cleanup: async () => {
			await client.close();
			await server.close();
		},
	};
}
