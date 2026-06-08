import { Database } from "bun:sqlite";
import { describe, expect, it, mock } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { decodeProviderModelRef } from "../../../model-providers/model-ref";
import { upsertModelProvider } from "../../../model-providers/storage";
import type { ModelProviderSummary } from "../../../model-providers/types";
import type { HostServiceContext } from "../../../types";
import { generateTaskDraft, selectTaskDraftGatewayModel } from "./task-draft";
import {
	extractTaskDraftFromGatewayResponse,
	parseTaskDraft,
} from "./task-draft-parser";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

function provider(
	overrides: Partial<ModelProviderSummary> & {
		id: string;
		models: ModelProviderSummary["models"];
	},
): ModelProviderSummary {
	return {
		name: overrides.id,
		protocol: "openai-chat",
		baseUrl: "http://provider.test",
		enabled: true,
		hasSecret: true,
		createdAt: 1,
		updatedAt: 1,
		...overrides,
	};
}

function model(
	modelId: string,
	overrides: Partial<ModelProviderSummary["models"][number]> = {},
): ModelProviderSummary["models"][number] {
	return {
		id: `${modelId}-row`,
		providerId: "provider",
		modelId,
		displayName: modelId,
		enabled: true,
		capabilities: {},
		...overrides,
	};
}

describe("task draft parsing", () => {
	it("normalizes a structured tool-use draft", () => {
		const draft = extractTaskDraftFromGatewayResponse({
			content: [
				{
					type: "tool_use",
					name: "propose_task_draft",
					input: {
						title: " Fix billing webhook retries ",
						description: "Add retry visibility.",
						priority: "high",
						labels: [" Billing ", "billing", "webhook"],
						dueDate: "2026-06-03",
					},
				},
			],
		});

		expect(draft).toEqual({
			title: "Fix billing webhook retries",
			description: "Add retry visibility.",
			priority: "high",
			labels: ["Billing", "webhook"],
			dueDate: "2026-06-03",
		});
	});

	it("parses JSON text fallback and drops invalid optional fields", () => {
		const draft = extractTaskDraftFromGatewayResponse({
			content: [
				{
					type: "text",
					text: '```json\n{"title":"Create support macro","priority":"none","labels":[" support "],"dueDate":"tomorrow"}\n```',
				},
			],
		});

		expect(draft).toEqual({
			title: "Create support macro",
			description: null,
			priority: "none",
			labels: ["support"],
			dueDate: null,
		});
	});

	it("rejects drafts without a title", () => {
		expect(() => parseTaskDraft({ description: "missing title" })).toThrow();
	});
});

describe("task draft model selection", () => {
	it("prefers gpt-5.5 over older enabled models", () => {
		const selected = selectTaskDraftGatewayModel([
			provider({
				id: "legacy-provider",
				models: [model("gpt-5.4-ziyan")],
			}),
			provider({
				id: "gateway-provider",
				models: [model("gpt-5.5")],
			}),
		]);

		expect(decodeProviderModelRef(selected ?? "")).toEqual({
			providerId: "gateway-provider",
			modelId: "gpt-5.5",
		});
	});

	it("falls back to the first usable enabled model", () => {
		const selected = selectTaskDraftGatewayModel([
			provider({
				id: "disabled-provider",
				enabled: false,
				models: [model("gpt-5.5")],
			}),
			provider({
				id: "missing-secret-provider",
				hasSecret: false,
				models: [model("gpt-5.5")],
			}),
			provider({
				id: "usable-provider",
				models: [model("claude-sonnet-4-5")],
			}),
		]);

		expect(decodeProviderModelRef(selected ?? "")).toEqual({
			providerId: "usable-provider",
			modelId: "claude-sonnet-4-5",
		});
	});

	it("returns null when no provider can serve a draft model", () => {
		expect(
			selectTaskDraftGatewayModel([
				provider({
					id: "disabled-provider",
					enabled: false,
					models: [model("gpt-5.5")],
				}),
				provider({
					id: "disabled-model-provider",
					models: [model("gpt-5.5", { enabled: false })],
				}),
			]),
		).toBeNull();
	});

	it("uses the preferred gpt-5.5 provider when generating a draft", async () => {
		const db = createTestDb();
		upsertModelProvider(db, {
			name: "A Legacy",
			protocol: "openai-chat",
			baseUrl: "http://legacy.test/v1",
			enabled: true,
			secret: "legacy-secret",
			models: [{ modelId: "gpt-5.4-ziyan" }],
		});
		upsertModelProvider(db, {
			name: "Z Gateway",
			protocol: "openai-chat",
			baseUrl: "http://gateway.test/v1",
			enabled: true,
			secret: "gateway-secret",
			models: [{ modelId: "gpt-5.5" }],
		});

		const originalFetch = globalThis.fetch;
		const fetchImpl = mock(
			async (input: string | URL | Request, init?: RequestInit) => {
				expect(String(input)).toBe("http://gateway.test/v1/chat/completions");
				const headers = init?.headers as Record<string, string>;
				expect(headers.authorization).toBe("Bearer gateway-secret");
				const body =
					typeof init?.body === "string"
						? (JSON.parse(init.body) as { model?: string })
						: {};
				expect(body.model).toBe("gpt-5.5");
				return new Response(
					JSON.stringify({
						id: "chatcmpl_1",
						choices: [
							{
								message: {
									tool_calls: [
										{
											id: "call_1",
											type: "function",
											function: {
												name: "propose_task_draft",
												arguments: JSON.stringify({
													title: "Refined task",
													priority: "none",
												}),
											},
										},
									],
								},
							},
						],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			},
		);
		globalThis.fetch = fetchImpl as unknown as typeof fetch;

		try {
			const draft = await generateTaskDraft({
				ctx: {
					db,
					hostServiceBaseUrl: "http://127.0.0.1:4879",
					hostServiceSecret: "internal-token",
				} as HostServiceContext,
				prompt: "make this better",
			});

			expect(draft.title).toBe("Refined task");
			expect(fetchImpl).toHaveBeenCalledTimes(1);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
