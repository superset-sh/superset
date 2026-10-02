import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { buildPluginServer } from "./plugin-server";
import type { PluginTarget } from "./resolve-target";

const TOOL: Tool = {
	name: "send_email",
	description: "Sends a new email immediately",
	inputSchema: {
		type: "object",
		properties: { body: { type: "string" } },
		required: ["body"],
	},
};

const ACCOUNTS = [
	{ connectionId: "id-work", userLabel: "satya@superset.sh", nickname: "work" },
	{ connectionId: "id-personal", userLabel: "satya@gmail.com", nickname: null },
];

interface Call {
	name: string;
	args: Record<string, unknown>;
	credential: string;
}

function hostedTarget(connectionId: string, calls: Call[]): PluginTarget {
	return {
		kind: "first-party",
		plugin: "gmail",
		version: "1.0.0",
		connectionId,
		secrets: {
			accessToken: `token-${connectionId}`,
			refreshToken: null,
			config: {},
		} as never,
		build: {
			getTools: () => [TOOL],
			credential: (secrets) => secrets.accessToken ?? "",
			callTool: async (name, args, credential) => {
				calls.push({ name, args, credential });
				return { content: [{ type: "text", text: `sent with ${credential}` }] };
			},
		},
	};
}

function expiredTarget(): PluginTarget {
	return {
		kind: "needs-auth",
		plugin: "gmail",
		version: "1.0.0",
		connector: "google",
		connectUrl: "https://api.superset.test/api/connectors/google/connect",
		reason: "the token expired",
	};
}

async function connect(target: PluginTarget) {
	const server = await buildPluginServer(target);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	const client = new Client({ name: "test", version: "1.0.0" });
	await Promise.all([
		server.connect(serverTransport),
		client.connect(clientTransport),
	]);
	return {
		client,
		close: async () => {
			await client.close();
			await server.close();
		},
	};
}

function multiTarget(
	resolve: (connectionId: string) => Promise<PluginTarget>,
): PluginTarget {
	return {
		kind: "multi",
		plugin: "gmail",
		version: "1.0.0",
		connector: "google",
		connectorLabel: "Google",
		accounts: ACCOUNTS,
		resolve,
	};
}

describe("a plugin server with two accounts", () => {
	test("advertises one tool list with the account as a required argument", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) => hostedTarget(id, calls)),
		);

		try {
			const { tools } = await client.listTools();
			expect(tools).toHaveLength(1);
			expect(tools[0].name).toBe("send_email");

			const properties = tools[0].inputSchema.properties as Record<
				string,
				Record<string, unknown>
			>;
			expect(properties.superset_account.enum).toEqual([
				"id-work",
				"id-personal",
			]);
			expect(tools[0].inputSchema.required).toContain("superset_account");
			expect(client.getInstructions()).toContain("2 accounts");
		} finally {
			await close();
		}
	});

	test("runs the call under the chosen account and forwards no account argument", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) => hostedTarget(id, calls)),
		);

		try {
			const result = await client.callTool({
				name: "send_email",
				arguments: { superset_account: "id-personal", body: "hi" },
			});

			expect(calls).toHaveLength(1);
			expect(calls[0].args).toEqual({ body: "hi" });
			expect(calls[0].credential).toBe("token-id-personal");
			expect(result.isError).toBeFalsy();
			expect(JSON.stringify(result.content)).toContain("token-id-personal");
			expect(JSON.stringify(result.content)).toContain(
				"(acted as satya@gmail.com)",
			);
			expect(result._meta).toMatchObject({ superset_account: "id-personal" });
		} finally {
			await close();
		}
	});

	test("a nickname picks the right account", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) => hostedTarget(id, calls)),
		);

		try {
			await client.callTool({
				name: "send_email",
				arguments: { superset_account: "work", body: "hi" },
			});
			expect(calls[0].credential).toBe("token-id-work");
		} finally {
			await close();
		}
	});

	test("a call with no account is a tool error naming the choices, not a transport failure", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) => hostedTarget(id, calls)),
		);

		try {
			const result = await client.callTool({
				name: "send_email",
				arguments: { body: "hi" },
			});

			expect(result.isError).toBe(true);
			expect(JSON.stringify(result.content)).toContain("pass superset_account");
			expect(JSON.stringify(result.content)).toContain("id-work (work)");
			expect(calls).toHaveLength(0);
		} finally {
			await close();
		}
	});

	test("an account the caller does not have is a tool error", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) => hostedTarget(id, calls)),
		);

		try {
			const result = await client.callTool({
				name: "send_email",
				arguments: { superset_account: "id-someone-else", body: "hi" },
			});

			expect(result.isError).toBe(true);
			expect(JSON.stringify(result.content)).toContain(
				"is not a connected Google account",
			);
			expect(calls).toHaveLength(0);
		} finally {
			await close();
		}
	});

	test("an expired account returns its reconnect link and leaves the other working", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) =>
				id === "id-personal" ? expiredTarget() : hostedTarget(id, calls),
			),
		);

		try {
			const expired = await client.callTool({
				name: "send_email",
				arguments: { superset_account: "id-personal", body: "hi" },
			});
			expect(expired.isError).toBe(true);
			expect(JSON.stringify(expired.content)).toContain(
				"needs to be reconnected",
			);
			expect(JSON.stringify(expired.content)).toContain(
				"/api/connectors/google/connect",
			);

			const live = await client.callTool({
				name: "send_email",
				arguments: { superset_account: "id-work", body: "hi" },
			});
			expect(live.isError).toBeFalsy();
			expect(calls).toHaveLength(1);
		} finally {
			await close();
		}
	});

	test("the tool list comes from a live account when the first one is expired", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) =>
				id === "id-work" ? expiredTarget() : hostedTarget(id, calls),
			),
		);

		try {
			const { tools } = await client.listTools();
			expect(tools).toHaveLength(1);
			expect(tools[0].inputSchema.required).toContain("superset_account");
		} finally {
			await close();
		}
	});
});

describe("a plugin server with one account", () => {
	test("is unchanged: no account argument anywhere", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(hostedTarget("id-work", calls));

		try {
			const { tools } = await client.listTools();
			expect(tools[0].inputSchema.properties).not.toHaveProperty(
				"superset_account",
			);
			expect(tools[0].inputSchema.required).toEqual(["body"]);

			const result = await client.callTool({
				name: "send_email",
				arguments: { body: "hi" },
			});
			expect(result.isError).toBeFalsy();
			expect(calls[0].args).toEqual({ body: "hi" });
			expect(calls[0].credential).toBe("token-id-work");
		} finally {
			await close();
		}
	});
});
