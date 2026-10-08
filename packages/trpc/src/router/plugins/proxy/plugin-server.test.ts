import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { buildPluginServer } from "./plugin-server";
import { type PluginTarget, PluginTargetError } from "./resolve-target";

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
	{ connectionId: "id-personal", userLabel: "satya@gmail.com" },
	{ connectionId: "id-work", userLabel: "work" },
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

async function connect(target: PluginTarget, rejected: string[] = []) {
	const server = await buildPluginServer(target, async (connectionId) => {
		rejected.push(connectionId);
	});
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
	hosted?: PluginTarget extends { hosted?: infer H } ? H : never,
): PluginTarget {
	return {
		kind: "multi",
		plugin: "gmail",
		version: "1.0.0",
		connector: "google",
		connectorLabel: "Google",
		accounts: ACCOUNTS,
		...(hosted ? { hosted } : {}),
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
				"id-personal",
				"id-work",
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

	test("the label picks the right account", async () => {
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

describe("which account the tool list comes from", () => {
	test("a hosted plugin asks no account what its tools are", async () => {
		const resolved: string[] = [];
		const calls: Call[] = [];
		const hosted = {
			getTools: () => [TOOL],
			credential: () => "c",
			callTool: async () => ({ content: [] }),
		};
		const { client, close } = await connect(
			multiTarget(async (id) => {
				resolved.push(id);
				return hostedTarget(id, calls);
			}, hosted as never),
		);

		try {
			const { tools } = await client.listTools();
			expect(tools).toHaveLength(1);
			const properties = tools[0].inputSchema.properties as Record<
				string,
				{ enum: string[] }
			>;
			expect(properties.superset_account.enum).toEqual([
				"id-personal",
				"id-work",
			]);
			expect(resolved).toEqual([]);
		} finally {
			await close();
		}
	});

	test("an account whose credential was rejected is not offered", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) =>
				id === "id-personal" ? expiredTarget() : hostedTarget(id, calls),
			),
		);

		try {
			const { tools } = await client.listTools();
			const properties = tools[0].inputSchema.properties as Record<
				string,
				{ enum: string[] }
			>;

			expect(properties.superset_account.enum).toEqual(["id-work"]);
		} finally {
			await close();
		}
	});

	test("an account the vendor could not answer for is still offered", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) => {
				if (id === "id-personal") throw new Error("socket hang up");
				return hostedTarget(id, calls);
			}),
		);

		try {
			const { tools } = await client.listTools();
			const properties = tools[0].inputSchema.properties as Record<
				string,
				{ enum: string[] }
			>;

			expect(properties.superset_account.enum).toEqual([
				"id-personal",
				"id-work",
			]);
		} finally {
			await close();
		}
	});
});

describe("a vendor rejecting the credential mid-session", () => {
	function rejectingTarget(connectionId: string): PluginTarget {
		return {
			kind: "first-party",
			plugin: "gmail",
			version: "1.0.0",
			connectionId,
			secrets: {
				accessToken: "revoked",
				refreshToken: null,
				config: {},
			} as never,
			build: {
				getTools: () => [TOOL],
				credential: () => "revoked",
				callTool: async () => {
					throw Object.assign(
						new Error("Gmail API error: invalid credentials"),
						{
							code: 401,
						},
					);
				},
			},
		};
	}

	test("a single-account call answers with a reconnect result, not a protocol error", async () => {
		const { client, close } = await connect(rejectingTarget("id-work"));

		try {
			const result = await client.callTool({
				name: "send_email",
				arguments: { body: "hi" },
			});

			expect(result.isError).toBe(true);
			expect(JSON.stringify(result.content)).toContain(
				"Ask the user to reconnect it",
			);
		} finally {
			await close();
		}
	});

	test("a multi-account call marks the account and names it in the error", async () => {
		const rejected: string[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) =>
				id === "id-personal" ? rejectingTarget(id) : hostedTarget(id, []),
			),
			rejected,
		);

		try {
			const result = await client.callTool({
				name: "send_email",
				arguments: { superset_account: "id-personal", body: "hi" },
			});

			expect(result.isError).toBe(true);
			expect(JSON.stringify(result.content)).toContain("rejected");
			expect(JSON.stringify(result.content)).toContain("satya@gmail.com");
			expect(rejected).toEqual(["id-personal"]);
		} finally {
			await close();
		}
	});

	test("an error without a 401 code is a plain tool failure, nothing marked", async () => {
		const target = rejectingTarget("id-work");
		target.build.callTool = async () => {
			throw new Error("Gmail API error: backend blew up");
		};
		const { client, close } = await connect(target);

		try {
			await expect(
				client.callTool({ name: "send_email", arguments: { body: "hi" } }),
			).rejects.toThrow("backend blew up");
		} finally {
			await close();
		}
	});
});

describe("review regressions", () => {
	test("every account expired lists the authenticate tool with each reconnect link", async () => {
		const { client, close } = await connect(
			multiTarget(async () => expiredTarget()),
		);

		try {
			const { tools } = await client.listTools();
			expect(tools.map((tool) => tool.name)).toEqual(["authenticate"]);

			const result = await client.callTool({
				name: "authenticate",
				arguments: {},
			});
			expect(result.isError).toBe(true);
			expect(JSON.stringify(result.content)).toContain(
				"https://api.superset.test/api/connectors/google/connect",
			);
		} finally {
			await close();
		}
	});

	test("an account the provider cannot refresh is a tool error, not a transport failure", async () => {
		const { client, close } = await connect(
			multiTarget(async (id) => {
				if (id === "id-personal")
					throw new PluginTargetError("token endpoint down", 502);
				return hostedTarget(id, []);
			}),
		);

		try {
			const result = await client.callTool({
				name: "send_email",
				arguments: { superset_account: "id-personal", body: "hi" },
			});
			expect(result.isError).toBe(true);
			expect(JSON.stringify(result.content)).toContain("token endpoint down");
		} finally {
			await close();
		}
	});

	test("a vendor-owned superset_account is forwarded and the advertised name picks the account", async () => {
		const calls: Call[] = [];
		const owned: Tool = {
			...TOOL,
			inputSchema: {
				...TOOL.inputSchema,
				properties: {
					...TOOL.inputSchema.properties,
					superset_account: { type: "string" },
				},
			},
		};
		const { client, close } = await connect(
			multiTarget(async (id) => {
				const target = hostedTarget(id, calls);
				if (target.kind === "first-party")
					target.build.getTools = () => [owned];
				return target;
			}),
		);

		try {
			await client.listTools();
			const result = await client.callTool({
				name: "send_email",
				arguments: {
					superset_account: "ACC-123",
					superset_account_id: "id-work",
					body: "hi",
				},
			});
			expect(result.isError).toBeFalsy();
			expect(calls).toEqual([
				{
					name: "send_email",
					args: { superset_account: "ACC-123", body: "hi" },
					credential: "token-id-work",
				},
			]);
		} finally {
			await close();
		}
	});
});

describe("superset-home review", () => {
	const SEARCH: Tool = {
		name: "search",
		inputSchema: { type: "object", properties: {} },
	};

	test("a call resolves only the account it names once the tool list is known", async () => {
		const resolved: string[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) => {
				resolved.push(id);
				return hostedTarget(id, []);
			}),
		);

		try {
			await client.listTools();
			resolved.length = 0;
			await client.callTool({
				name: "send_email",
				arguments: { superset_account: "id-work", body: "hi" },
			});
			expect(resolved).toEqual(["id-work"]);
		} finally {
			await close();
		}
	});

	test("an account that does not expose the tool is refused by name", async () => {
		const calls: Call[] = [];
		const { client, close } = await connect(
			multiTarget(async (id) => {
				const target = hostedTarget(id, calls);
				if (target.kind === "first-party" && id === "id-personal")
					target.build.getTools = () => [SEARCH];
				return target;
			}),
		);

		try {
			await client.listTools();
			const result = await client.callTool({
				name: "send_email",
				arguments: { superset_account: "id-personal", body: "hi" },
			});
			expect(result.isError).toBe(true);
			expect(JSON.stringify(result.content)).toContain(
				"does not offer send_email",
			);
			expect(calls).toEqual([]);
		} finally {
			await close();
		}
	});
});
