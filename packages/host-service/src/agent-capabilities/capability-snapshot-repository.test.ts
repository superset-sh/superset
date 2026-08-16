import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import {
	type AgentCapabilityInventory,
	CAPABILITY_INVENTORY_SCHEMA_VERSION,
	CAPABILITY_SNAPSHOT_DISPLAY_MAX_AGE_MS,
	CAPABILITY_SNAPSHOT_RETENTION_MS,
	CapabilityInventoryValidationError,
	decodeCapabilityInventory,
	encodeCapabilityInventory,
	listCapabilitySnapshots,
	pruneExpiredCapabilitySnapshots,
	writeCapabilitySnapshotIfCurrentRevision,
} from "./capability-snapshot-repository";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");
const testDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		testDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

function openDb(path = ":memory:") {
	const sqlite = new Database(path);
	const bunDb = drizzle(sqlite, { schema });
	migrate(bunDb, { migrationsFolder: MIGRATIONS_FOLDER });
	sqlite.exec("PRAGMA foreign_keys = ON");
	// SAFETY: Tests use Bun's SQLite driver, whose run result differs nominally from HostDb; repository operations used here are otherwise identical.
	return { sqlite, db: bunDb as unknown as HostDb };
}

function seedConfig(
	db: HostDb,
	input: { id?: string; presetId?: string; capabilityRevision?: number } = {},
) {
	const config = {
		id: input.id ?? "agent-1",
		presetId: input.presetId ?? "codex",
		capabilityRevision: input.capabilityRevision ?? 1,
	};
	db.insert(schema.hostAgentConfigs)
		.values({
			...config,
			label: "Test Agent",
			command: "test-agent",
			argsJson: "[]",
			promptTransport: "argv",
			promptArgsJson: "[]",
			resumeArgsJson: "[]",
			envJson: "{}",
			displayOrder: 0,
		})
		.run();
	return config;
}

function inventory(
	config: ReturnType<typeof seedConfig>,
	overrides: Partial<AgentCapabilityInventory> = {},
): AgentCapabilityInventory {
	return {
		schemaVersion: CAPABILITY_INVENTORY_SCHEMA_VERSION,
		agentId: config.id,
		presetId: config.presetId,
		configRevision: config.capabilityRevision,
		detectedVersion: "1.2.3",
		modelSource: "runtime",
		models: [
			{
				id: "model-1",
				label: "Model 1",
				reasoning: {
					state: "supported",
					defaultId: "high",
					options: [
						{ id: "low", label: "Low" },
						{ id: "high", label: "High" },
					],
				},
				variant: {
					familyId: "model",
					familyLabel: "Model",
					effort: "high",
					speed: "fast",
					mode: "thinking",
					contextWindow: "1m",
				},
			},
		],
		inventoryCheckedAt: "2026-08-14T12:00:00.000Z",
		...overrides,
	};
}

function writeSnapshot(
	db: HostDb,
	config: ReturnType<typeof seedConfig>,
	overrides: Partial<
		Parameters<typeof writeCapabilitySnapshotIfCurrentRevision>[1]
	> = {},
) {
	const now = Date.parse("2026-08-14T12:00:00.000Z");
	return writeCapabilitySnapshotIfCurrentRevision(db, {
		agentId: config.id,
		presetId: config.presetId,
		configRevision: config.capabilityRevision,
		inventory: inventory(config),
		status: "ready",
		installed: true,
		auth: "authenticated",
		inventoryCheckedAt: now,
		statusCheckedAt: now,
		writtenAt: now,
		...overrides,
	});
}

describe("capability snapshot repository", () => {
	it("hydrates a valid snapshot after reopening the SQLite database", async () => {
		const directory = await mkdtemp(join(tmpdir(), "superset-capabilities-"));
		testDirectories.push(directory);
		const path = join(directory, "host.sqlite");
		const first = openDb(path);
		const config = seedConfig(first.db);
		expect(writeSnapshot(first.db, config)).toBe(true);
		first.sqlite.close();

		const reopened = openDb(path);
		const snapshots = listCapabilitySnapshots(reopened.db, {
			now: Date.parse("2026-08-14T12:01:00.000Z"),
		});
		expect(snapshots).toHaveLength(1);
		expect(snapshots[0]?.inventory?.models[0]).toMatchObject({
			id: "model-1",
			reasoning: { state: "supported", defaultId: "high" },
			variant: {
				familyId: "model",
				familyLabel: "Model",
				effort: "high",
				speed: "fast",
				mode: "thinking",
				contextWindow: "1m",
			},
		});
		reopened.sqlite.close();
	});

	it("persists unknown health without coercing installed null", () => {
		const { db } = openDb();
		const config = seedConfig(db);
		expect(
			writeSnapshot(db, config, {
				inventory: null,
				status: "unknown",
				installed: null,
				auth: "unknown",
				inventoryCheckedAt: null,
			}),
		).toBe(true);
		expect(
			listCapabilitySnapshots(db, {
				now: Date.parse("2026-08-14T12:01:00.000Z"),
			})[0],
		).toMatchObject({
			status: "unknown",
			installed: null,
			auth: "unknown",
			inventory: null,
		});
	});

	it("rejects and deletes secret-bearing diagnostic messages", () => {
		const { db } = openDb();
		const config = seedConfig(db);
		expect(() =>
			writeSnapshot(db, config, {
				message: "sk-secret-regression-token-9f3a leaked from stderr",
			}),
		).toThrow(CapabilityInventoryValidationError);

		writeSnapshot(db, config);
		db.update(schema.hostAgentCapabilitySnapshots)
			.set({ message: "sk-secret-regression-token-9f3a leaked from stderr" })
			.where(eq(schema.hostAgentCapabilitySnapshots.agentId, config.id))
			.run();
		expect(listCapabilitySnapshots(db)).toEqual([]);
		expect(
			db
				.select()
				.from(schema.hostAgentCapabilitySnapshots)
				.where(eq(schema.hostAgentCapabilitySnapshots.agentId, config.id))
				.get(),
		).toBeUndefined();
	});

	it("applies the generated snapshot migration on a fresh temp database", async () => {
		const directory = await mkdtemp(join(tmpdir(), "superset-cap-migrate-"));
		testDirectories.push(directory);
		const path = join(directory, "host.sqlite");
		const first = openDb(path);
		const columns = first.sqlite
			.query("pragma table_info(host_agent_capability_snapshots)")
			.all() as Array<{ name: string }>;
		expect(columns.map((column) => column.name)).toEqual(
			expect.arrayContaining([
				"agent_id",
				"preset_id",
				"config_revision",
				"schema_version",
				"inventory_json",
				"status",
				"installed",
				"auth",
				"error_kind",
				"message",
				"resolver_source",
				"inventory_checked_at",
				"status_checked_at",
				"written_at",
			]),
		);
		const configColumns = first.sqlite
			.query("pragma table_info(host_agent_configs)")
			.all() as Array<{ name: string }>;
		expect(configColumns.map((column) => column.name)).toContain(
			"capability_revision",
		);
		const config = seedConfig(first.db);
		expect(writeSnapshot(first.db, config)).toBe(true);
		first.sqlite.close();

		const reopened = openDb(path);
		expect(
			listCapabilitySnapshots(reopened.db, {
				now: Date.parse("2026-08-14T12:01:00.000Z"),
			}),
		).toHaveLength(1);
		reopened.sqlite.close();
	});

	it("keeps missing-executable health while clearing inventory", () => {
		const { db } = openDb();
		const config = seedConfig(db);
		expect(
			writeSnapshot(db, config, {
				inventory: null,
				status: "unavailable",
				installed: false,
				auth: "unknown",
				inventoryCheckedAt: null,
			}),
		).toBe(true);
		const snapshot = listCapabilitySnapshots(db, {
			now: Date.parse("2026-08-14T12:01:00.000Z"),
		})[0];
		expect(snapshot).toMatchObject({
			status: "unavailable",
			installed: false,
			auth: "unknown",
			inventory: null,
		});
	});

	it("rejects an obsolete probe after the config revision changes", () => {
		const { db } = openDb();
		const config = seedConfig(db);
		db.update(schema.hostAgentConfigs)
			.set({ capabilityRevision: config.capabilityRevision + 1 })
			.where(eq(schema.hostAgentConfigs.id, config.id))
			.run();

		expect(writeSnapshot(db, config)).toBe(false);
		expect(
			db
				.select()
				.from(schema.hostAgentCapabilitySnapshots)
				.where(eq(schema.hostAgentCapabilitySnapshots.agentId, config.id))
				.get(),
		).toBeUndefined();
	});

	it("deletes corrupt and mismatched persisted rows", () => {
		const { db } = openDb();
		const config = seedConfig(db);
		writeSnapshot(db, config);
		db.update(schema.hostAgentCapabilitySnapshots)
			.set({ inventoryJson: "{not-json" })
			.where(eq(schema.hostAgentCapabilitySnapshots.agentId, config.id))
			.run();
		expect(listCapabilitySnapshots(db)).toEqual([]);
		expect(
			db
				.select()
				.from(schema.hostAgentCapabilitySnapshots)
				.where(eq(schema.hostAgentCapabilitySnapshots.agentId, config.id))
				.get(),
		).toBeUndefined();

		writeSnapshot(db, config);
		db.update(schema.hostAgentCapabilitySnapshots)
			.set({ configRevision: config.capabilityRevision + 1 })
			.where(eq(schema.hostAgentCapabilitySnapshots.agentId, config.id))
			.run();
		expect(listCapabilitySnapshots(db)).toEqual([]);
	});

	it("deletes rows with an unknown schema version", () => {
		const { db } = openDb();
		const config = seedConfig(db);
		writeSnapshot(db, config);
		db.update(schema.hostAgentCapabilitySnapshots)
			.set({ schemaVersion: CAPABILITY_INVENTORY_SCHEMA_VERSION + 1 })
			.where(eq(schema.hostAgentCapabilitySnapshots.agentId, config.id))
			.run();
		expect(listCapabilitySnapshots(db)).toEqual([]);
		expect(
			db
				.select()
				.from(schema.hostAgentCapabilitySnapshots)
				.where(eq(schema.hostAgentCapabilitySnapshots.agentId, config.id))
				.get(),
		).toBeUndefined();
	});

	it("strictly rejects duplicate ids, unknown fields, and oversized payloads", () => {
		const { db } = openDb();
		const config = seedConfig(db);
		const duplicateModels = inventory(config, {
			models: [...inventory(config).models, ...inventory(config).models],
		});
		expect(() => encodeCapabilityInventory(duplicateModels)).toThrow(
			CapabilityInventoryValidationError,
		);

		const withSecret = {
			...inventory(config),
			env: { SECRET_TOKEN: "must-not-persist" },
		};
		expect(() => encodeCapabilityInventory(withSecret)).toThrow(
			CapabilityInventoryValidationError,
		);

		const oversized = inventory(config, {
			models: Array.from({ length: 2_000 }, (_, index) => ({
				id: `model-${index}`,
				label: `Model ${index} ${"x".repeat(300)}`,
				reasoning: { state: "unknown" as const },
			})),
		});
		expect(() => encodeCapabilityInventory(oversized)).toThrow(/size limit/);
	});

	it("rejects invalid defaults and duplicate reasoning options", () => {
		const { db } = openDb();
		const config = seedConfig(db);
		const base = inventory(config).models[0];
		expect(base).toBeDefined();
		if (!base) return;
		expect(() =>
			encodeCapabilityInventory(
				inventory(config, {
					models: [
						{
							...base,
							reasoning: {
								state: "supported",
								defaultId: "missing",
								options: [{ id: "high", label: "High" }],
							},
						},
					],
				}),
			),
		).toThrow(CapabilityInventoryValidationError);
		expect(() =>
			decodeCapabilityInventory(
				JSON.stringify(
					inventory(config, {
						models: [
							{
								...base,
								reasoning: {
									state: "supported",
									options: [
										{ id: "high", label: "High" },
										{ id: "high", label: "High Again" },
									],
								},
							},
						],
					}),
				),
			),
		).toThrow(CapabilityInventoryValidationError);
	});

	it("keeps display-expired rows until retention cleanup", () => {
		const { db } = openDb();
		const config = seedConfig(db);
		const storedAt = 1_000;
		writeSnapshot(db, config, {
			writtenAt: storedAt,
			statusCheckedAt: storedAt,
			inventoryCheckedAt: storedAt,
			inventory: inventory(config, {
				inventoryCheckedAt: new Date(storedAt).toISOString(),
			}),
		});
		const listed = listCapabilitySnapshots(db, {
			now: 10_000,
			maxDisplayAgeMs: 1_000,
		});
		expect(listed).toHaveLength(1);
		expect(listed[0]?.inventory).toBeNull();
		expect(listed[0]?.inventoryCheckedAt).toBe(storedAt);
		const stored = listCapabilitySnapshots(db, {
			now: 10_000,
			maxDisplayAgeMs: 1_000,
			includeHiddenInventory: true,
		})[0];
		expect(stored?.inventory?.models).toHaveLength(1);
		expect(
			db
				.select()
				.from(schema.hostAgentCapabilitySnapshots)
				.where(eq(schema.hostAgentCapabilitySnapshots.agentId, config.id))
				.get(),
		).toBeDefined();
		expect(
			pruneExpiredCapabilitySnapshots(db, { now: 10_000, retentionMs: 1_000 }),
		).toBe(1);
	});

	it("cascade-deletes a snapshot with its agent config", () => {
		const { db } = openDb();
		const config = seedConfig(db);
		writeSnapshot(db, config);
		db.delete(schema.hostAgentConfigs)
			.where(eq(schema.hostAgentConfigs.id, config.id))
			.run();
		expect(
			db
				.select()
				.from(schema.hostAgentCapabilitySnapshots)
				.where(eq(schema.hostAgentCapabilitySnapshots.agentId, config.id))
				.get(),
		).toBeUndefined();
	});

	it("prunes retention-expired snapshots while respecting max display age", () => {
		const { db } = openDb();
		const config1 = seedConfig(db, { id: "agent-recent" });
		const config2 = seedConfig(db, { id: "agent-old" });
		const now = Date.parse("2026-08-14T12:00:00.000Z");
		const recentAt = now - 5 * 86_400_000;
		const oldAt = now - 10 * 86_400_000;

		writeSnapshot(db, config1, {
			writtenAt: recentAt,
			statusCheckedAt: recentAt,
			inventoryCheckedAt: recentAt,
			inventory: inventory(config1, {
				inventoryCheckedAt: new Date(recentAt).toISOString(),
			}),
		});
		writeSnapshot(db, config2, {
			writtenAt: oldAt,
			statusCheckedAt: oldAt,
			inventoryCheckedAt: oldAt,
			inventory: inventory(config2, {
				inventoryCheckedAt: new Date(oldAt).toISOString(),
			}),
		});

		const displayable = listCapabilitySnapshots(db, { now });
		expect(displayable).toHaveLength(2);
		expect(
			displayable.find((snapshot) => snapshot.agentId === "agent-recent")
				?.inventory,
		).not.toBeNull();
		expect(
			displayable.find((snapshot) => snapshot.agentId === "agent-old")
				?.inventory,
		).toBeNull();
		expect(
			listCapabilitySnapshots(db, { now, includeHiddenInventory: true }).find(
				(snapshot) => snapshot.agentId === "agent-old",
			)?.inventory?.models,
		).toHaveLength(1);

		expect(pruneExpiredCapabilitySnapshots(db, { now })).toBe(0);

		const futureNow = now + 25 * 86_400_000;
		expect(pruneExpiredCapabilitySnapshots(db, { now: futureNow })).toBe(1);
		expect(
			db
				.select()
				.from(schema.hostAgentCapabilitySnapshots)
				.where(eq(schema.hostAgentCapabilitySnapshots.agentId, config2.id))
				.get(),
		).toBeUndefined();
	});

	it("keeps the 7-day display cap distinct from 30-day retention", () => {
		const { db } = openDb();
		const displayableConfig = seedConfig(db, { id: "agent-displayable" });
		const hiddenConfig = seedConfig(db, { id: "agent-hidden" });
		const retainedConfig = seedConfig(db, { id: "agent-retained" });
		const now = Date.parse("2026-08-14T12:00:00.000Z");
		const displayableAt = now - CAPABILITY_SNAPSHOT_DISPLAY_MAX_AGE_MS;
		const hiddenAt = now - CAPABILITY_SNAPSHOT_DISPLAY_MAX_AGE_MS - 1;
		const retainedAt = now - CAPABILITY_SNAPSHOT_RETENTION_MS + 1;

		for (const [config, storedAt] of [
			[displayableConfig, displayableAt],
			[hiddenConfig, hiddenAt],
			[retainedConfig, retainedAt],
		] as const) {
			writeSnapshot(db, config, {
				writtenAt: storedAt,
				statusCheckedAt: storedAt,
				inventoryCheckedAt: storedAt,
				inventory: inventory(config, {
					inventoryCheckedAt: new Date(storedAt).toISOString(),
				}),
			});
		}

		const displayed = listCapabilitySnapshots(db, { now });
		expect(
			displayed.find((snapshot) => snapshot.agentId === "agent-displayable")
				?.inventory,
		).not.toBeNull();
		expect(
			displayed.find((snapshot) => snapshot.agentId === "agent-hidden")
				?.inventory,
		).toBeNull();
		expect(
			displayed.find((snapshot) => snapshot.agentId === "agent-retained")
				?.inventory,
		).toBeNull();

		const stored = listCapabilitySnapshots(db, {
			now,
			includeHiddenInventory: true,
		});
		expect(stored.map((snapshot) => snapshot.agentId).sort()).toEqual([
			"agent-displayable",
			"agent-hidden",
			"agent-retained",
		]);
		expect(
			stored.every((snapshot) => snapshot.inventory?.models.length === 1),
		).toBe(true);
		expect(pruneExpiredCapabilitySnapshots(db, { now })).toBe(0);
	});
});
