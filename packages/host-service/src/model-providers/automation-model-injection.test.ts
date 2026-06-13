import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import type { ResolvedHostAgentConfig } from "../trpc/router/agents/agents";
import { prepareAutomationModelInjection } from "./automation-model-injection";
import { upsertModelProvider } from "./storage";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

function createTestDb() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db;
}

function asHostDb(db: ReturnType<typeof createTestDb>): HostDb {
	return db as unknown as HostDb;
}

function claudeConfig(): ResolvedHostAgentConfig {
	return {
		id: "agent-1",
		presetId: "claude",
		label: "Claude",
		command: "claude",
		args: [],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
	};
}

describe("prepareAutomationModelInjection", () => {
	it("writes Claude model env only into the automation task directory", () => {
		const db = createTestDb();
		const provider = upsertModelProvider(asHostDb(db), {
			name: "Superset Relay",
			protocol: "openai-responses",
			baseUrl: "http://upstream.test/v1",
			enabled: true,
			secret: "provider-secret",
			models: [{ modelId: "gpt-5.5(xhigh)" }],
		});
		const runDirectory = mkdtempSync(join(tmpdir(), "superset-run-"));

		try {
			const result = prepareAutomationModelInjection({
				db: asHostDb(db),
				config: claudeConfig(),
				automationId: "automation-1",
				runDirectory,
				hostServiceBaseUrl: "http://127.0.0.1:4879",
				selection: {
					providerId: provider.id,
					modelId: "gpt-5.5(xhigh)",
				},
			});

			const settingsPath = join(runDirectory, ".claude", "settings.local.json");
			expect(result?.family).toBe("claude");
			expect(result?.configPath).toBe(settingsPath);
			expect(existsSync(settingsPath)).toBe(true);
			expect(existsSync(join(runDirectory, ".claude"))).toBe(true);

			const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
				env: Record<string, string>;
			};
			expect(settings.env.ANTHROPIC_BASE_URL).toBe(
				"http://127.0.0.1:4879/model-gateway",
			);
			expect(settings.env.ANTHROPIC_AUTH_TOKEN).toStartWith("superset_");
			expect(settings.env.ANTHROPIC_AUTH_TOKEN).not.toBe("provider-secret");
			expect(settings.env.ANTHROPIC_MODEL).toBe("gpt-5.5(xhigh)");
			expect(settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("gpt-5.5(xhigh)");
			expect(settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe(
				"gpt-5.5(xhigh)",
			);
			expect(settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("gpt-5.5(xhigh)");
		} finally {
			rmSync(runDirectory, { recursive: true, force: true });
		}
	});
});
