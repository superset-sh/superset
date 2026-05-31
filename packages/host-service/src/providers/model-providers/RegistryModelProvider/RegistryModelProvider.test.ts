import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { encodeProviderModelRef } from "../../../model-providers/model-ref";
import { upsertModelProvider } from "../../../model-providers/storage";
import type { ModelProviderRuntimeResolver } from "../types";
import { RegistryModelProvider } from "./RegistryModelProvider";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");
const ENV_KEYS = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"ANTHROPIC_BASE_URL",
	"OPENAI_API_KEY",
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

function snapshotEnv(): Partial<Record<EnvKey, string | undefined>> {
	return Object.fromEntries(
		ENV_KEYS.map((key) => [key, process.env[key]]),
	) as Partial<Record<EnvKey, string | undefined>>;
}

function restoreEnv(
	snapshot: Partial<Record<EnvKey, string | undefined>>,
): void {
	for (const key of ENV_KEYS) {
		const value = snapshot[key];
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

describe("RegistryModelProvider", () => {
	let envSnapshot: Partial<Record<EnvKey, string | undefined>>;

	beforeEach(() => {
		envSnapshot = snapshotEnv();
		for (const key of ENV_KEYS) {
			delete process.env[key];
		}
	});

	afterEach(() => {
		restoreEnv(envSnapshot);
	});

	it("prepares gateway auth env for provider-backed Chat models", async () => {
		const db = createTestDb();
		const provider = upsertModelProvider(db, {
			name: "Gateway",
			protocol: "openai-chat",
			baseUrl: "http://provider.test/v1",
			enabled: true,
			secret: "provider-secret",
			models: [{ modelId: "gpt-5.5" }],
		});
		const fallback: ModelProviderRuntimeResolver = {
			hasUsableRuntimeEnv: mock(async () => false),
			prepareRuntimeEnv: mock(async () => {
				throw new Error("fallback should not prepare registry models");
			}),
		};
		const resolver = new RegistryModelProvider({
			db,
			fallback,
			gatewayBaseUrl: "http://127.0.0.1:4879/model-gateway/",
			internalToken: "gateway-token",
		});

		expect(await resolver.hasUsableRuntimeEnv()).toBe(true);
		const result = await resolver.prepareRuntimeEnvForModel({
			workspaceId: "workspace-1",
			modelId: encodeProviderModelRef({
				providerId: provider.id,
				modelId: "gpt-5.5",
			}),
		});

		expect(result.modelId).toStartWith("anthropic/superset:");
		expect(process.env.ANTHROPIC_API_KEY).toBe("gateway-token");
		expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe("gateway-token");
		expect(process.env.ANTHROPIC_BASE_URL).toBe(
			"http://127.0.0.1:4879/model-gateway",
		);
		expect(process.env.OPENAI_API_KEY).toBeUndefined();
		expect(fallback.prepareRuntimeEnv).not.toHaveBeenCalled();
	});

	it("delegates ordinary model ids to the fallback resolver", async () => {
		const db = createTestDb();
		const fallback: ModelProviderRuntimeResolver = {
			hasUsableRuntimeEnv: mock(async () => true),
			prepareRuntimeEnv: mock(async () => {
				process.env.ANTHROPIC_API_KEY = "fallback-token";
			}),
			prepareRuntimeEnvForModel: mock(async () => {
				process.env.ANTHROPIC_API_KEY = "fallback-token";
				return { modelId: "anthropic/claude-sonnet-4-5" };
			}),
		};
		const resolver = new RegistryModelProvider({
			db,
			fallback,
			gatewayBaseUrl: "http://127.0.0.1:4879/model-gateway",
			internalToken: "gateway-token",
		});

		const result = await resolver.prepareRuntimeEnvForModel({
			workspaceId: "workspace-1",
			modelId: "claude-sonnet-4-5",
		});

		expect(result).toEqual({ modelId: "anthropic/claude-sonnet-4-5" });
		expect(process.env.ANTHROPIC_API_KEY).toBe("fallback-token");
		expect(process.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
		expect(fallback.prepareRuntimeEnvForModel).toHaveBeenCalledTimes(1);
	});
});
