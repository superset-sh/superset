import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { encodeGatewayModelId } from "../model-providers/model-ref";
import { upsertModelProvider } from "../model-providers/storage";
import { handleModelGatewayRequest } from "./gateway";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

function createTestDb() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db;
}

function seedWorkspace(db: ReturnType<typeof createTestDb>) {
	db.insert(schema.projects)
		.values({ id: "project-1", repoPath: "/tmp/project-1" })
		.run();
	db.insert(schema.workspaces)
		.values({
			id: "workspace-1",
			projectId: "project-1",
			worktreePath: "/tmp/project-1/worktree",
			branch: "main",
		})
		.run();
}

function asHostDb(db: ReturnType<typeof createTestDb>): HostDb {
	return db as unknown as HostDb;
}

describe("handleModelGatewayRequest", () => {
	it("routes a workspace gateway model id to the configured upstream provider", async () => {
		const db = createTestDb();
		seedWorkspace(db);
		const provider = upsertModelProvider(asHostDb(db), {
			name: "OpenAI-compatible",
			protocol: "openai-chat",
			baseUrl: "http://upstream.test/v1",
			enabled: true,
			secret: "secret-key",
			models: [{ modelId: "gpt-5.5" }],
		});
		db.insert(schema.workspaceAgentModelConfigs)
			.values({
				id: "config-1",
				workspaceId: "workspace-1",
				agent: "claude",
				providerId: provider.id,
				gatewayToken: "workspace-token",
				haikuModelId: "gpt-5.5",
				sonnetModelId: "gpt-5.5",
				opusModelId: "gpt-5.5",
			})
			.run();
		const gatewayModelId = encodeGatewayModelId({
			providerId: provider.id,
			modelId: "gpt-5.5",
		});
		const fetchImpl = async (
			input: string | URL | Request,
			init?: RequestInit,
		): Promise<Response> => {
			expect(String(input)).toBe("http://upstream.test/v1/chat/completions");
			expect(init?.headers).toEqual({
				"content-type": "application/json",
				authorization: "Bearer secret-key",
			});
			const body =
				typeof init?.body === "string"
					? (JSON.parse(init.body) as { model?: string })
					: {};
			expect(body.model).toBe("gpt-5.5");
			return new Response(
				JSON.stringify({
					id: "chatcmpl_1",
					choices: [{ message: { content: "ok" } }],
					usage: { prompt_tokens: 1, completion_tokens: 2 },
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		};

		const response = await handleModelGatewayRequest({
			db: asHostDb(db),
			request: new Request("http://127.0.0.1/model-gateway/v1/messages", {
				method: "POST",
				headers: { authorization: "Bearer workspace-token" },
				body: JSON.stringify({
					model: gatewayModelId,
					messages: [{ role: "user", content: "hello" }],
					max_tokens: 64,
				}),
			}),
			fetchImpl,
		});

		expect(response.status).toBe(200);
		const parsed = (await response.json()) as {
			content?: Array<{ text?: string }>;
			usage?: { input_tokens?: number; output_tokens?: number };
		};
		expect(parsed.content?.[0]?.text).toBe("ok");
		expect(parsed.usage?.input_tokens).toBe(1);
		expect(parsed.usage?.output_tokens).toBe(2);
	});

	it("accepts unversioned Anthropic-compatible endpoint paths", async () => {
		const db = createTestDb();
		seedWorkspace(db);
		const provider = upsertModelProvider(asHostDb(db), {
			name: "OpenAI-compatible",
			protocol: "openai-chat",
			baseUrl: "http://upstream.test/v1",
			enabled: true,
			secret: "secret-key",
			models: [{ modelId: "gpt-5.5" }],
		});
		db.insert(schema.workspaceAgentModelConfigs)
			.values({
				id: "config-1",
				workspaceId: "workspace-1",
				agent: "claude",
				providerId: provider.id,
				gatewayToken: "workspace-token",
				haikuModelId: "gpt-5.5",
				sonnetModelId: "gpt-5.5",
				opusModelId: "gpt-5.5",
			})
			.run();

		const modelsResponse = await handleModelGatewayRequest({
			db: asHostDb(db),
			request: new Request("http://127.0.0.1/model-gateway/models", {
				method: "GET",
				headers: { authorization: "Bearer workspace-token" },
			}),
		});
		expect(modelsResponse.status).toBe(200);
		expect(await modelsResponse.json()).toEqual({
			data: [{ id: "gpt-5.5", type: "model" }],
		});

		const messagesResponse = await handleModelGatewayRequest({
			db: asHostDb(db),
			request: new Request("http://127.0.0.1/model-gateway/messages", {
				method: "POST",
				headers: { authorization: "Bearer workspace-token" },
				body: JSON.stringify({
					model: "gpt-5.5",
					messages: [{ role: "user", content: "hello" }],
					max_tokens: 64,
				}),
			}),
			fetchImpl: async (input): Promise<Response> => {
				expect(String(input)).toBe("http://upstream.test/v1/chat/completions");
				return new Response(
					JSON.stringify({
						id: "chatcmpl_1",
						choices: [{ message: { content: "ok" } }],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			},
		});

		expect(messagesResponse.status).toBe(200);
		const parsed = (await messagesResponse.json()) as {
			content?: Array<{ text?: string }>;
		};
		expect(parsed.content?.[0]?.text).toBe("ok");
	});

	it("routes raw workspace model ids by gateway token", async () => {
		const db = createTestDb();
		seedWorkspace(db);
		const provider = upsertModelProvider(asHostDb(db), {
			name: "OpenAI-compatible",
			protocol: "openai-chat",
			baseUrl: "http://upstream.test/v1",
			enabled: true,
			secret: "secret-key",
			models: [{ modelId: "gpt-5.5" }],
		});
		db.insert(schema.workspaceAgentModelConfigs)
			.values({
				id: "config-1",
				workspaceId: "workspace-1",
				agent: "claude",
				providerId: provider.id,
				gatewayToken: "workspace-token",
				haikuModelId: "gpt-5.5",
				sonnetModelId: "gpt-5.5",
				opusModelId: "gpt-5.5",
			})
			.run();

		const response = await handleModelGatewayRequest({
			db: asHostDb(db),
			request: new Request("http://127.0.0.1/model-gateway/v1/messages", {
				method: "POST",
				headers: { authorization: "Bearer workspace-token" },
				body: JSON.stringify({
					model: "gpt-5.5",
					messages: [{ role: "user", content: "hello" }],
					max_tokens: 64,
				}),
			}),
			fetchImpl: async (input, init): Promise<Response> => {
				expect(String(input)).toBe("http://upstream.test/v1/chat/completions");
				const body =
					typeof init?.body === "string"
						? (JSON.parse(init.body) as { model?: string })
						: {};
				expect(body.model).toBe("gpt-5.5");
				return new Response(
					JSON.stringify({
						id: "chatcmpl_1",
						choices: [{ message: { content: "ok" } }],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			},
		});

		expect(response.status).toBe(200);
	});

	it("routes raw automation model ids by automation gateway token", async () => {
		const db = createTestDb();
		const provider = upsertModelProvider(asHostDb(db), {
			name: "OpenAI-compatible",
			protocol: "openai-chat",
			baseUrl: "http://upstream.test/v1",
			enabled: true,
			secret: "secret-key",
			models: [{ modelId: "gpt-5.5" }],
		});
		db.insert(schema.automationAgentModelConfigs)
			.values({
				id: "automation-config-1",
				automationId: "automation-1",
				agent: "claude",
				providerId: provider.id,
				gatewayToken: "automation-token",
				modelId: "gpt-5.5",
			})
			.run();

		const modelsResponse = await handleModelGatewayRequest({
			db: asHostDb(db),
			request: new Request("http://127.0.0.1/model-gateway/v1/models", {
				method: "GET",
				headers: { authorization: "Bearer automation-token" },
			}),
		});
		expect(modelsResponse.status).toBe(200);
		expect(await modelsResponse.json()).toEqual({
			data: [{ id: "gpt-5.5", type: "model" }],
		});

		const response = await handleModelGatewayRequest({
			db: asHostDb(db),
			request: new Request("http://127.0.0.1/model-gateway/v1/messages", {
				method: "POST",
				headers: { authorization: "Bearer automation-token" },
				body: JSON.stringify({
					model: "gpt-5.5",
					messages: [{ role: "user", content: "hello" }],
					max_tokens: 64,
				}),
			}),
			fetchImpl: async (input, init): Promise<Response> => {
				expect(String(input)).toBe("http://upstream.test/v1/chat/completions");
				const body =
					typeof init?.body === "string"
						? (JSON.parse(init.body) as { model?: string })
						: {};
				expect(body.model).toBe("gpt-5.5");
				return new Response(
					JSON.stringify({
						id: "chatcmpl_1",
						choices: [{ message: { content: "ok" } }],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			},
		});

		expect(response.status).toBe(200);
	});

	it("returns a sanitized provider failure when upstream fetch fails", async () => {
		const db = createTestDb();
		seedWorkspace(db);
		const provider = upsertModelProvider(asHostDb(db), {
			name: "OpenAI-compatible",
			protocol: "openai-chat",
			baseUrl: "http://upstream.test/v1",
			enabled: true,
			secret: "secret-key",
			models: [{ modelId: "gpt-5.5" }],
		});
		db.insert(schema.workspaceAgentModelConfigs)
			.values({
				id: "config-1",
				workspaceId: "workspace-1",
				agent: "claude",
				providerId: provider.id,
				gatewayToken: "workspace-token",
				haikuModelId: "gpt-5.5",
				sonnetModelId: "gpt-5.5",
				opusModelId: "gpt-5.5",
			})
			.run();

		const response = await handleModelGatewayRequest({
			db: asHostDb(db),
			request: new Request("http://127.0.0.1/model-gateway/v1/messages", {
				method: "POST",
				headers: { authorization: "Bearer workspace-token" },
				body: JSON.stringify({
					model: "gpt-5.5",
					messages: [{ role: "user", content: "hello" }],
					max_tokens: 64,
				}),
			}),
			fetchImpl: async () => {
				throw new Error("secret-key low-level fetch failed");
			},
		});

		expect(response.status).toBe(502);
		const text = await response.text();
		expect(text).toContain("Model provider request failed");
		expect(text).not.toContain("secret-key");
	});

	it("does not let a workspace gateway token call another provider by encoded ref", async () => {
		const db = createTestDb();
		seedWorkspace(db);
		const allowedProvider = upsertModelProvider(asHostDb(db), {
			name: "Allowed",
			protocol: "openai-chat",
			baseUrl: "http://allowed.test",
			enabled: true,
			secret: "allowed-secret",
			models: [{ modelId: "gpt-5.5" }],
		});
		const blockedProvider = upsertModelProvider(asHostDb(db), {
			name: "Blocked",
			protocol: "openai-chat",
			baseUrl: "http://blocked.test",
			enabled: true,
			secret: "blocked-secret",
			models: [{ modelId: "gpt-5.5" }],
		});
		db.insert(schema.workspaceAgentModelConfigs)
			.values({
				id: "config-1",
				workspaceId: "workspace-1",
				agent: "claude",
				providerId: allowedProvider.id,
				gatewayToken: "workspace-token",
				haikuModelId: "gpt-5.5",
				sonnetModelId: "gpt-5.5",
				opusModelId: "gpt-5.5",
			})
			.run();

		const response = await handleModelGatewayRequest({
			db: asHostDb(db),
			request: new Request("http://127.0.0.1/model-gateway/v1/messages", {
				method: "POST",
				headers: { authorization: "Bearer workspace-token" },
				body: JSON.stringify({
					model: encodeGatewayModelId({
						providerId: blockedProvider.id,
						modelId: "gpt-5.5",
					}),
					messages: [{ role: "user", content: "hello" }],
					max_tokens: 64,
				}),
			}),
			fetchImpl: async () => {
				throw new Error("fetch should not be called");
			},
		});

		expect(response.status).toBe(404);
		expect(await response.text()).not.toContain("blocked-secret");
	});
});
