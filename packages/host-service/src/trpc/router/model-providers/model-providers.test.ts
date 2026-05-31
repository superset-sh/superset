import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { modelProvidersRouter } from "./model-providers";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createTestDb() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db;
}

function createCaller() {
	const db = createTestDb();
	const ctx = {
		db,
		isAuthenticated: true,
		hostServiceBaseUrl: "http://127.0.0.1:4879",
	} as unknown as HostServiceContext;
	return { caller: modelProvidersRouter.createCaller(ctx), db };
}

describe("modelProvidersRouter", () => {
	let tempRoot: string | null = null;

	afterEach(() => {
		if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
		tempRoot = null;
	});

	it("stores providers with redacted secret reads and encoded chat model ids", async () => {
		const { caller } = createCaller();

		const saved = await caller.upsert({
			name: "Gateway",
			protocol: "openai-chat",
			baseUrl: "http://example.test/v1",
			enabled: true,
			secret: "secret-key",
			models: [{ modelId: "gpt-5.5", displayName: "GPT 5.5" }],
		});

		expect(saved.hasSecret).toBe(true);
		expect(JSON.stringify(saved)).not.toContain("secret-key");

		const list = await caller.list();
		expect(list).toHaveLength(1);
		expect(JSON.stringify(list)).not.toContain("secret-key");

		const chatModels = await caller.listChatModels();
		expect(chatModels[0]?.id).toStartWith("anthropic/superset:");
		expect(chatModels[0]?.provider).toBe("Gateway");
		expect(chatModels[0]?.modelId).toBe("gpt-5.5");
	});

	it("fetches remote models with saved credentials and sanitized errors", async () => {
		const { caller } = createCaller();
		const saved = await caller.upsert({
			name: "Gateway",
			protocol: "openai-chat",
			baseUrl: "http://example.test/v1",
			enabled: true,
			secret: "saved-secret",
			models: [{ modelId: "placeholder" }],
		});
		const originalFetch = globalThis.fetch;
		const fetchImpl = mock(
			async (input: string | URL | Request, init?: RequestInit) => {
				expect(String(input)).toBe("http://example.test/v1/models");
				const headers = init?.headers as Headers;
				expect(headers.get("authorization")).toBe("Bearer saved-secret");
				return new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }] }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		);
		globalThis.fetch = fetchImpl as unknown as typeof fetch;

		try {
			const result = await caller.fetchRemoteModels({ id: saved.id });
			expect(result.models).toEqual([
				{ modelId: "gpt-5.5", displayName: "gpt-5.5" },
			]);
			expect(JSON.stringify(result)).not.toContain("saved-secret");
		} finally {
			globalThis.fetch = originalFetch;
		}

		const failingFetch = mock(async () => {
			throw new Error("saved-secret");
		});
		globalThis.fetch = failingFetch as unknown as typeof fetch;
		try {
			await expect(caller.fetchRemoteModels({ id: saved.id })).rejects.toThrow(
				"Model list request failed before receiving a response",
			);
			await expect(
				caller.fetchRemoteModels({ id: saved.id }),
			).rejects.not.toThrow("saved-secret");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("updates and deletes providers without exposing saved credentials", async () => {
		const { caller } = createCaller();
		const saved = await caller.upsert({
			name: "Gateway",
			protocol: "openai-chat",
			baseUrl: "http://example.test/v1",
			enabled: true,
			secret: "saved-secret",
			models: [{ modelId: "gpt-5.5" }],
		});

		const updated = await caller.upsert({
			id: saved.id,
			name: "Gateway Updated",
			protocol: "openai-responses",
			baseUrl: "http://responses.example.test/v1",
			enabled: false,
			models: [
				{ modelId: "gpt-5.5", enabled: true },
				{ modelId: "codex-max", displayName: "Codex Max", enabled: false },
			],
		});

		expect(updated.name).toBe("Gateway Updated");
		expect(updated.protocol).toBe("openai-responses");
		expect(updated.enabled).toBe(false);
		expect(updated.hasSecret).toBe(true);
		expect(updated.models.map((model) => model.modelId)).toEqual([
			"gpt-5.5",
			"codex-max",
		]);
		expect(JSON.stringify(updated)).not.toContain("saved-secret");
		expect(await caller.listChatModels()).toEqual([]);

		expect(await caller.delete({ id: saved.id })).toEqual({ deleted: true });
		expect(await caller.list()).toEqual([]);
		expect(await caller.delete({ id: saved.id })).toEqual({ deleted: false });
	});

	it("writes Claude Code settings through the local gateway", async () => {
		const { caller, db } = createCaller();
		tempRoot = mkdtempSync(join(tmpdir(), "superset-model-provider-"));
		db.insert(schema.projects)
			.values({ id: "project-1", repoPath: tempRoot })
			.run();
		db.insert(schema.workspaces)
			.values({
				id: "workspace-1",
				projectId: "project-1",
				worktreePath: tempRoot,
				branch: "main",
			})
			.run();
		const provider = await caller.upsert({
			name: "Gateway",
			protocol: "openai-responses",
			baseUrl: "http://example.test",
			enabled: true,
			secret: "secret-key",
			models: [
				{ modelId: "gpt-5.5-haiku" },
				{ modelId: "gpt-5.5" },
				{ modelId: "gpt-5.5(xhigh)" },
			],
		});

		const result = await caller.saveWorkspaceClaudeConfig({
			workspaceId: "workspace-1",
			providerId: provider.id,
			haikuModelId: "gpt-5.5-haiku",
			sonnetModelId: "gpt-5.5",
			opusModelId: "gpt-5.5(xhigh)",
			disableOneMillionContext: true,
		});

		expect(result.gatewayBaseUrl).toBe("http://127.0.0.1:4879/model-gateway");
		const parsed = JSON.parse(readFileSync(result.settingsPath, "utf8"));
		expect(parsed.env.ANTHROPIC_BASE_URL).toBe(
			"http://127.0.0.1:4879/model-gateway",
		);
		expect(parsed.env.ANTHROPIC_AUTH_TOKEN).toStartWith("superset_");
		expect(parsed.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("gpt-5.5-haiku");
		expect(parsed.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("gpt-5.5");
		expect(parsed.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("gpt-5.5(xhigh)");
		expect(JSON.stringify(parsed)).not.toContain("secret-key");
	});
});
