import { Database } from "bun:sqlite";
import { describe, expect, it, spyOn } from "bun:test";
import * as childProcess from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { z } from "zod";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import {
	type AgentCapabilityConfig,
	AgentCapabilityProbeAbortedError,
	type AgentCapabilitySnapshot,
	runCommand,
} from "./agent-capabilities";
import {
	CapabilityRefreshService,
	ObsoleteCapabilityRefreshError,
	type RevisionedAgentCapabilityConfig,
	readPersistedCapabilitySnapshots,
} from "./capability-refresh-service";
import {
	CAPABILITY_INVENTORY_SCHEMA_VERSION,
	CAPABILITY_SNAPSHOT_DISPLAY_MAX_AGE_MS,
	CAPABILITY_SNAPSHOT_RETENTION_MS,
	listCapabilitySnapshots,
	SANITIZED_CAPABILITY_MESSAGES,
	writeCapabilitySnapshotIfCurrentRevision,
} from "./capability-snapshot-repository";
import { initializeHostCapabilitySnapshots } from "./capability-startup";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");
const nodeErrorSchema = z.object({ code: z.string() });
const CHECKED_AT = "2026-08-14T12:00:00.000Z";
const CHECKED_AT_MS = Date.parse(CHECKED_AT);

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const bunDb = drizzle(sqlite, { schema });
	migrate(bunDb, { migrationsFolder: MIGRATIONS_FOLDER });
	sqlite.exec("PRAGMA foreign_keys = ON");
	// SAFETY: Tests use Bun's SQLite driver, whose run result differs nominally from HostDb; repository operations used here are otherwise identical.
	return bunDb as unknown as HostDb;
}

const refreshServices = new WeakMap<HostDb, CapabilityRefreshService>();

function getRefreshService(db: HostDb): CapabilityRefreshService {
	const existing = refreshServices.get(db);
	if (existing) return existing;
	const service = new CapabilityRefreshService(db);
	refreshServices.set(db, service);
	return service;
}

function refreshAgentCapability(
	db: HostDb,
	config: RevisionedAgentCapabilityConfig,
	options: Parameters<CapabilityRefreshService["refreshCapability"]>[1] = {},
): ReturnType<CapabilityRefreshService["refreshCapability"]> {
	return getRefreshService(db).refreshCapability(config, options);
}

function refreshAgentCapabilities(
	db: HostDb,
	configs: RevisionedAgentCapabilityConfig[],
	options: Parameters<CapabilityRefreshService["refreshCapabilities"]>[1] = {},
): ReturnType<CapabilityRefreshService["refreshCapabilities"]> {
	return getRefreshService(db).refreshCapabilities(configs, options);
}

function seedConfig(
	db: HostDb,
	id = "agent-1",
): RevisionedAgentCapabilityConfig {
	const config = {
		id,
		presetId: "codex",
		command: "codex",
		args: [],
		env: {},
		configRevision: 1,
	};
	db.insert(schema.hostAgentConfigs)
		.values({
			id: config.id,
			presetId: config.presetId,
			label: "Codex",
			command: config.command,
			argsJson: "[]",
			promptTransport: "argv",
			promptArgsJson: "[]",
			resumeArgsJson: "[]",
			envJson: "{}",
			capabilityRevision: config.configRevision,
			displayOrder: 0,
		})
		.run();
	return config;
}

function liveSnapshot(
	config: RevisionedAgentCapabilityConfig,
	overrides: Partial<AgentCapabilitySnapshot> = {},
): AgentCapabilitySnapshot {
	return {
		agentId: config.id,
		presetId: config.presetId,
		status: "ready",
		installed: true,
		auth: "authenticated",
		version: "1.0.0",
		modelSource: "runtime",
		models: [
			{
				id: "model-1",
				label: "Model 1",
				reasoning: { state: "unknown" },
			},
		],
		message: null,
		checkedAt: CHECKED_AT,
		...overrides,
	};
}

function persistSnapshot(
	db: HostDb,
	config: RevisionedAgentCapabilityConfig,
	atMs = CHECKED_AT_MS,
): void {
	writeCapabilitySnapshotIfCurrentRevision(db, {
		agentId: config.id,
		presetId: config.presetId,
		configRevision: config.configRevision,
		inventory: {
			schemaVersion: CAPABILITY_INVENTORY_SCHEMA_VERSION,
			agentId: config.id,
			presetId: config.presetId,
			configRevision: config.configRevision,
			detectedVersion: "1.0.0",
			modelSource: "runtime",
			models: liveSnapshot(config).models,
			inventoryCheckedAt: new Date(atMs).toISOString(),
		},
		status: "ready",
		installed: true,
		auth: "authenticated",
		inventoryCheckedAt: atMs,
		statusCheckedAt: atMs,
		writtenAt: atMs,
	});
}

function rawSnapshotRow(db: HostDb, agentId: string) {
	return db
		.select()
		.from(schema.hostAgentCapabilitySnapshots)
		.where(eq(schema.hostAgentCapabilitySnapshots.agentId, agentId))
		.get();
}

async function waitForPidFile(path: string): Promise<number> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < 2_000) {
		const contents = await Bun.file(path)
			.text()
			.catch(() => "");
		const pid = Number.parseInt(contents.trim(), 10);
		if (Number.isInteger(pid) && pid > 0) return pid;
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
	}
	throw new Error(`timed out waiting for pid file ${path}`);
}

function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		const parsed = nodeErrorSchema.safeParse(error);
		return parsed.success && parsed.data.code === "EPERM";
	}
}

async function expectPidGone(pid: number): Promise<void> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < 2_000) {
		if (!isPidAlive(pid)) return;
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
	}
	throw new Error(`pid ${pid} was still alive`);
}

describe("capability refresh service", () => {
	it("reads persisted snapshots without invoking a probe", () => {
		const db = createTestDb();
		const config = seedConfig(db);
		persistSnapshot(db, config);
		expect(readPersistedCapabilitySnapshots(db, CHECKED_AT_MS + 1_000)).toEqual(
			[
				{
					agentId: config.id,
					presetId: config.presetId,
					inventory: {
						schemaVersion: CAPABILITY_INVENTORY_SCHEMA_VERSION,
						agentId: config.id,
						presetId: config.presetId,
						configRevision: config.configRevision,
						detectedVersion: "1.0.0",
						modelSource: "runtime",
						models: liveSnapshot(config).models,
						inventoryCheckedAt: CHECKED_AT,
					},
					inventoryOrigin: "persisted",
					health: {
						status: "ready",
						installed: true,
						auth: "authenticated",
						checkedAt: CHECKED_AT,
						errorKind: null,
						message: null,
					},
					healthOrigin: "persisted",
				},
			],
		);
	});

	it("preserves unknown health and null installed without coercing", () => {
		const db = createTestDb();
		const config = seedConfig(db);
		writeCapabilitySnapshotIfCurrentRevision(db, {
			agentId: config.id,
			presetId: config.presetId,
			configRevision: config.configRevision,
			inventory: null,
			status: "unknown",
			installed: null,
			auth: "unknown",
			inventoryCheckedAt: null,
			statusCheckedAt: CHECKED_AT_MS,
			writtenAt: CHECKED_AT_MS,
		});
		const [view] = readPersistedCapabilitySnapshots(db, CHECKED_AT_MS + 1_000);
		expect(view).toEqual({
			agentId: config.id,
			presetId: config.presetId,
			inventory: null,
			inventoryOrigin: "none",
			health: {
				status: "unknown",
				installed: null,
				auth: "unknown",
				checkedAt: CHECKED_AT,
				errorKind: null,
				message: null,
			},
			healthOrigin: "persisted",
		});
	});

	it("honors every explicit refresh after a transient failure", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		const service = new CapabilityRefreshService(db);
		let probes = 0;
		const probe = async (
			_config: AgentCapabilityConfig,
			options: { now?: number },
		) => {
			probes += 1;
			return liveSnapshot(config, {
				status: probes < 3 ? "unavailable" : "ready",
				auth: probes < 3 ? "unknown" : "authenticated",
				modelSource: probes < 3 ? "none" : "runtime",
				models: probes < 3 ? [] : liveSnapshot(config).models,
				errorKind: probes < 3 ? "timeout" : null,
				message: probes < 3 ? "secret stderr must not persist" : null,
				resolverSource: "wrapper",
				checkedAt: new Date(options.now ?? CHECKED_AT_MS).toISOString(),
			});
		};

		await service.refreshCapability(config, { now: CHECKED_AT_MS, probe });
		expect(listCapabilitySnapshots(db)[0]).toMatchObject({
			errorKind: "timeout",
			message: SANITIZED_CAPABILITY_MESSAGES.timeout,
			resolverSource: "wrapper",
		});
		await service.refreshCapability(config, { now: CHECKED_AT_MS + 1, probe });
		const recovered = await service.refreshCapability(config, {
			now: CHECKED_AT_MS + 2,
			probe,
		});
		expect(recovered).toMatchObject({
			health: { status: "ready", errorKind: null },
		});
		expect(probes).toBe(3);
		await service.dispose();
	});

	it("refreshes a persisted observation without a picker TTL", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		persistSnapshot(db, config);
		let probeCalls = 0;
		const result = await refreshAgentCapability(db, config, {
			now: CHECKED_AT_MS + 5 * 60 * 1_000 - 1,
			probe: async () => {
				probeCalls += 1;
				return liveSnapshot(config);
			},
		});
		expect(probeCalls).toBe(1);
		expect(result.inventory?.models).toHaveLength(1);
	});

	it("coalesces concurrent stale refreshes by agent revision", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		let probeCalls = 0;
		const probe = async () => {
			probeCalls += 1;
			await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
			return liveSnapshot(config);
		};
		const [first, second] = await Promise.all([
			refreshAgentCapability(db, config, { probe }),
			refreshAgentCapability(db, config, { probe }),
		]);
		expect(probeCalls).toBe(1);
		expect(second).toEqual(first);
	});

	it("probes every sequential explicit refresh", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		let probes = 0;
		const probe = async () => {
			probes += 1;
			return liveSnapshot(config);
		};

		await refreshAgentCapability(db, config, {
			now: CHECKED_AT_MS,
			probe,
		});
		await refreshAgentCapability(db, config, {
			now: CHECKED_AT_MS + 29_999,
			probe,
		});

		expect(probes).toBe(2);
	});

	it("cancels in-flight work and rejects new refreshes after disposal", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		const service = new CapabilityRefreshService(db);
		const refresh = service
			.refreshCapability(config, {
				probe: (_config, options) =>
					new Promise((_resolve, reject) => {
						options.signal?.addEventListener(
							"abort",
							() => reject(new AgentCapabilityProbeAbortedError()),
							{ once: true },
						);
					}),
			})
			.catch((error: unknown) => error);

		await service.dispose();

		expect(await refresh).toBeInstanceOf(AgentCapabilityProbeAbortedError);
		await expect(service.refreshCapability(config)).rejects.toBeInstanceOf(
			AgentCapabilityProbeAbortedError,
		);
	});

	it("isolates refresh state between app instances", async () => {
		const firstDb = createTestDb();
		const secondDb = createTestDb();
		const firstConfig = seedConfig(firstDb);
		const secondConfig = seedConfig(secondDb);
		const firstService = new CapabilityRefreshService(firstDb);
		const secondService = new CapabilityRefreshService(secondDb);
		let probes = 0;

		const first = await firstService.refreshCapability(firstConfig, {
			probe: async () => {
				probes += 1;
				return liveSnapshot(firstConfig, { version: "first" });
			},
		});
		const second = await secondService.refreshCapability(secondConfig, {
			probe: async () => {
				probes += 1;
				return liveSnapshot(secondConfig, { version: "second" });
			},
		});

		expect(probes).toBe(2);
		expect(first.inventory?.detectedVersion).toBe("first");
		expect(second.inventory?.detectedVersion).toBe("second");
		await Promise.all([firstService.dispose(), secondService.dispose()]);
	});

	it("retains last-good inventory during a live auth failure", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		persistSnapshot(db, config);
		const result = await refreshAgentCapability(db, config, {
			now: CHECKED_AT_MS + 10_000,
			probe: async () =>
				liveSnapshot(config, {
					status: "authentication_required",
					auth: "unauthenticated",
					modelSource: "none",
					models: [],
					checkedAt: "2026-08-14T12:00:10.000Z",
				}),
		});
		expect(result).toMatchObject({
			health: {
				status: "authentication_required",
				auth: "unauthenticated",
				message: SANITIZED_CAPABILITY_MESSAGES.authenticationRequired,
			},
			inventory: { models: [{ id: "model-1" }] },
			inventoryOrigin: "persisted",
			healthOrigin: "live",
		});
		expect(listCapabilitySnapshots(db)[0]?.inventory?.models).toHaveLength(1);
	});

	it("clears inventory after a confirmed missing executable", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		persistSnapshot(db, config);
		const view = await refreshAgentCapability(db, config, {
			probe: async () =>
				liveSnapshot(config, {
					status: "unavailable",
					installed: false,
					auth: "unknown",
					modelSource: "none",
					models: [],
					errorKind: "missing_executable",
				}),
		});
		expect(view).toMatchObject({
			inventory: null,
			inventoryOrigin: "none",
			health: {
				status: "unavailable",
				installed: false,
				errorKind: "missing_executable",
				message: SANITIZED_CAPABILITY_MESSAGES.missingExecutable,
			},
			healthOrigin: "live",
		});
		const persisted = listCapabilitySnapshots(db)[0];
		expect(persisted).toMatchObject({
			installed: false,
			inventory: null,
			status: "unavailable",
			errorKind: "missing_executable",
			message: SANITIZED_CAPABILITY_MESSAGES.missingExecutable,
		});
		expect(persisted?.inventoryCheckedAt).toBeNull();
	});

	it("rejects a probe result after the config revision changes", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		await expect(
			refreshAgentCapability(db, config, {
				probe: async () => {
					db.update(schema.hostAgentConfigs)
						.set({ capabilityRevision: 2 })
						.where(eq(schema.hostAgentConfigs.id, config.id))
						.run();
					return liveSnapshot(config);
				},
			}),
		).rejects.toBeInstanceOf(ObsoleteCapabilityRefreshError);
	});

	it("bounds concurrency while preserving config order", async () => {
		const db = createTestDb();
		const configs = Array.from({ length: 5 }, (_, index) =>
			seedConfig(db, `agent-${index}`),
		);
		let active = 0;
		let maxActive = 0;
		const results = await refreshAgentCapabilities(db, configs, {
			concurrency: 2,
			probe: async (config) => {
				active += 1;
				maxActive = Math.max(maxActive, active);
				await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
				active -= 1;
				return liveSnapshot(config as RevisionedAgentCapabilityConfig);
			},
		});
		expect(maxActive).toBe(2);
		expect(results.map((result) => result.agentId)).toEqual(
			configs.map((config) => config.id),
		);
	});

	it("converts oversized live inventory into parse_failure health while preserving last-good inventory", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		persistSnapshot(db, config);

		const service = new CapabilityRefreshService(db);
		const result = await service.refreshCapability(config, {
			now: CHECKED_AT_MS + 10_000,
			probe: async () =>
				liveSnapshot(config, {
					models: Array.from({ length: 2_001 }, (_, index) => ({
						id: `model-${index}`,
						label: `Model ${index}`,
						reasoning: { state: "unknown" as const },
					})),
				}),
		});

		expect(result).toMatchObject({
			health: {
				status: "unavailable",
				errorKind: "parse_failure",
				message: SANITIZED_CAPABILITY_MESSAGES.parseFailure,
			},
			inventory: { models: [{ id: "model-1" }] },
			inventoryOrigin: "persisted",
			healthOrigin: "live",
		});

		const persisted = listCapabilitySnapshots(db)[0];
		expect(persisted).toMatchObject({
			status: "unavailable",
			errorKind: "parse_failure",
			message: SANITIZED_CAPABILITY_MESSAGES.parseFailure,
		});
		expect(persisted?.inventory?.models).toHaveLength(1);

		await service.dispose();
	});

	it("treats malformed live inventory as parse_failure while retaining last-good inventory", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		persistSnapshot(db, config);
		const service = new CapabilityRefreshService(db);
		const result = await service.refreshCapability(config, {
			now: CHECKED_AT_MS + 10_000,
			probe: async () =>
				liveSnapshot(config, {
					models: [
						{
							id: "broken",
							label: "Broken",
							reasoning: {
								state: "supported",
								options: [],
							},
						},
					],
				}),
		});
		expect(result).toMatchObject({
			health: {
				status: "unavailable",
				errorKind: "parse_failure",
				message: SANITIZED_CAPABILITY_MESSAGES.parseFailure,
			},
			inventory: { models: [{ id: "model-1" }] },
			inventoryOrigin: "persisted",
			healthOrigin: "live",
		});
		expect(listCapabilitySnapshots(db)[0]?.inventory?.models).toHaveLength(1);
		await service.dispose();
	});

	it("isolates per-agent failures in batch refresh without suppressing successful results or corrupting order", async () => {
		const db = createTestDb();
		const agent1 = seedConfig(db, "agent-1");
		const agent2 = seedConfig(db, "agent-2");
		const agent3 = seedConfig(db, "agent-3");
		persistSnapshot(db, agent2);

		const service = new CapabilityRefreshService(db);
		const results = await service.refreshCapabilities(
			[agent1, agent2, agent3],
			{
				now: CHECKED_AT_MS + 5_000,
				probe: async (config) => {
					if (config.id === "agent-2") {
						throw new Error("Provider explosion");
					}
					return liveSnapshot(config as RevisionedAgentCapabilityConfig, {
						version: `ver-${config.id}`,
					});
				},
			},
		);

		expect(results).toHaveLength(3);
		expect(results.map((r) => r.agentId)).toEqual([
			"agent-1",
			"agent-2",
			"agent-3",
		]);
		expect(results[0]).toMatchObject({
			agentId: "agent-1",
			health: { status: "ready" },
			inventory: { detectedVersion: "ver-agent-1" },
		});
		expect(results[1]).toMatchObject({
			agentId: "agent-2",
			health: {
				status: "unavailable",
				errorKind: "process_failure",
				message: SANITIZED_CAPABILITY_MESSAGES.processFailure,
			},
			inventory: { detectedVersion: "1.0.0" },
			inventoryOrigin: "persisted",
			healthOrigin: "live",
		});
		expect(results[2]).toMatchObject({
			agentId: "agent-3",
			health: { status: "ready" },
			inventory: { detectedVersion: "ver-agent-3" },
		});

		await service.dispose();
	});

	it("keeps installation unknown when the first probe throws", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		const service = new CapabilityRefreshService(db);

		const view = await service.refreshCapability(config, {
			now: CHECKED_AT_MS,
			probe: async () => {
				throw new Error("Provider explosion");
			},
		});

		expect(view).toMatchObject({
			health: {
				status: "unavailable",
				installed: null,
				errorKind: "process_failure",
			},
			inventory: null,
			inventoryOrigin: "none",
			healthOrigin: "live",
		});
		expect(listCapabilitySnapshots(db)[0]?.installed).toBeNull();

		await service.dispose();
	});

	it("preserves cancellation safety during batch refresh when signal is aborted", async () => {
		const db = createTestDb();
		const agent1 = seedConfig(db, "agent-1");
		const agent2 = seedConfig(db, "agent-2");
		const service = new CapabilityRefreshService(db);

		const refreshPromise = service
			.refreshCapabilities([agent1, agent2], {
				probe: (_config, options) =>
					new Promise((_resolve, reject) => {
						options.signal?.addEventListener(
							"abort",
							() => reject(new AgentCapabilityProbeAbortedError()),
							{ once: true },
						);
					}),
			})
			.catch((err: unknown) => err);

		await service.dispose();
		expect(await refreshPromise).toBeInstanceOf(
			AgentCapabilityProbeAbortedError,
		);
	});

	it("keeps secret-bearing probe output out of the API view and SQLite", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		persistSnapshot(db, config);
		const secret = "sk-secret-regression-token-9f3a";
		const service = new CapabilityRefreshService(db);
		const view = await service.refreshCapability(config, {
			now: CHECKED_AT_MS + 10_000,
			probe: async () => {
				throw new Error(
					`provider boom stdout=${secret} stderr=${secret} message=${secret}`,
				);
			},
		});

		expect(JSON.stringify(view)).not.toContain(secret);
		expect(view).toMatchObject({
			health: {
				status: "unavailable",
				errorKind: "process_failure",
				message: SANITIZED_CAPABILITY_MESSAGES.processFailure,
			},
			inventory: { models: [{ id: "model-1" }] },
			inventoryOrigin: "persisted",
			healthOrigin: "live",
		});

		const persisted = listCapabilitySnapshots(db)[0];
		expect(persisted?.message).toBe(
			SANITIZED_CAPABILITY_MESSAGES.processFailure,
		);
		const sqliteRow = db
			.select()
			.from(schema.hostAgentCapabilitySnapshots)
			.where(eq(schema.hostAgentCapabilitySnapshots.agentId, config.id))
			.get();
		expect(JSON.stringify(sqliteRow)).not.toContain(secret);
		expect(sqliteRow?.message).toBe(
			SANITIZED_CAPABILITY_MESSAGES.processFailure,
		);
		expect(sqliteRow?.inventoryJson).not.toContain(secret);

		await service.dispose();
	});

	it("rethrows ObsoleteCapabilityRefreshError from batch refresh instead of masking it", async () => {
		const db = createTestDb();
		const current = seedConfig(db, "agent-current");
		const obsolete = seedConfig(db, "agent-obsolete");
		const service = new CapabilityRefreshService(db);

		await expect(
			service.refreshCapabilities([current, obsolete], {
				now: CHECKED_AT_MS,
				probe: async (config) => {
					if (config.id === obsolete.id) {
						db.update(schema.hostAgentConfigs)
							.set({ capabilityRevision: 2 })
							.where(eq(schema.hostAgentConfigs.id, obsolete.id))
							.run();
					}
					return liveSnapshot(config as RevisionedAgentCapabilityConfig);
				},
			}),
		).rejects.toBeInstanceOf(ObsoleteCapabilityRefreshError);

		await service.dispose();
	});

	it("returns the exact nested API view after a live refresh", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		const service = new CapabilityRefreshService(db);
		const view = await service.refreshCapability(config, {
			now: CHECKED_AT_MS,
			probe: async () => liveSnapshot(config),
		});

		expect(Object.keys(view).sort()).toEqual([
			"agentId",
			"health",
			"healthOrigin",
			"inventory",
			"inventoryOrigin",
			"presetId",
		]);
		expect(Object.keys(view.health).sort()).toEqual([
			"auth",
			"checkedAt",
			"errorKind",
			"installed",
			"message",
			"status",
		]);
		expect(view.inventory && Object.keys(view.inventory).sort()).toEqual([
			"agentId",
			"configRevision",
			"detectedVersion",
			"inventoryCheckedAt",
			"modelSource",
			"models",
			"presetId",
			"schemaVersion",
		]);
		expect(view).toEqual({
			agentId: config.id,
			presetId: config.presetId,
			inventory: {
				schemaVersion: CAPABILITY_INVENTORY_SCHEMA_VERSION,
				agentId: config.id,
				presetId: config.presetId,
				configRevision: config.configRevision,
				detectedVersion: "1.0.0",
				modelSource: "runtime",
				models: liveSnapshot(config).models,
				inventoryCheckedAt: CHECKED_AT,
			},
			inventoryOrigin: "live",
			health: {
				status: "ready",
				installed: true,
				auth: "authenticated",
				checkedAt: CHECKED_AT,
				errorKind: null,
				message: null,
			},
			healthOrigin: "live",
		});

		await service.dispose();
	});

	it("preserves last-good inventory stored 7-30 days ago without making it displayable", async () => {
		const cases = [
			{
				ageMs: CAPABILITY_SNAPSHOT_DISPLAY_MAX_AGE_MS + 1,
				errorKind: "timeout" as const,
				message: SANITIZED_CAPABILITY_MESSAGES.timeout,
			},
			{
				ageMs: 20 * 86_400_000,
				errorKind: "process_failure" as const,
				message: SANITIZED_CAPABILITY_MESSAGES.processFailure,
			},
			{
				ageMs: CAPABILITY_SNAPSHOT_RETENTION_MS - 1,
				errorKind: "parse_failure" as const,
				message: SANITIZED_CAPABILITY_MESSAGES.parseFailure,
			},
		];
		for (const { ageMs, errorKind, message } of cases) {
			const db = createTestDb();
			const config = seedConfig(db);
			const storedAt = CHECKED_AT_MS - ageMs;
			persistSnapshot(db, config, storedAt);

			const view = await refreshAgentCapability(db, config, {
				now: CHECKED_AT_MS,
				probe: async () =>
					liveSnapshot(config, {
						status: "unavailable",
						auth: "unknown",
						modelSource: "none",
						models: [],
						errorKind,
						checkedAt: CHECKED_AT,
					}),
			});

			expect(view.inventory).toBeNull();
			expect(view.inventoryOrigin).toBe("none");
			expect(view.health).toMatchObject({
				errorKind,
				message,
			});

			const stored = listCapabilitySnapshots(db, {
				now: CHECKED_AT_MS,
				includeHiddenInventory: true,
			})[0];
			expect(stored?.inventory?.models).toHaveLength(1);
			expect(stored?.inventoryCheckedAt).toBe(storedAt);
			expect(rawSnapshotRow(db, config.id)?.inventoryJson).toContain("model-1");

			const displayed = readPersistedCapabilitySnapshots(db, CHECKED_AT_MS);
			expect(displayed[0]?.inventory).toBeNull();
			expect(displayed[0]?.inventoryOrigin).toBe("none");
			expect(displayed[0]?.health.errorKind).toBe(errorKind);
		}
	});

	it("still displays last-good inventory within the 7-day display cap after a transient failure", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		const storedAt = CHECKED_AT_MS - CAPABILITY_SNAPSHOT_DISPLAY_MAX_AGE_MS + 1;
		persistSnapshot(db, config, storedAt);

		const view = await refreshAgentCapability(db, config, {
			now: CHECKED_AT_MS,
			probe: async () =>
				liveSnapshot(config, {
					status: "unavailable",
					modelSource: "none",
					models: [],
					errorKind: "process_failure",
					checkedAt: CHECKED_AT,
				}),
		});

		expect(view.inventory?.models).toHaveLength(1);
		expect(view.inventoryOrigin).toBe("persisted");
		expect(
			readPersistedCapabilitySnapshots(db, CHECKED_AT_MS)[0]?.inventory?.models,
		).toHaveLength(1);
	});

	it("persists every unchanged explicit refresh observation", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		persistSnapshot(db, config);
		const launchAt = CHECKED_AT_MS + 31_000;

		await refreshAgentCapability(db, config, {
			now: launchAt,
			probe: async () =>
				liveSnapshot(config, {
					checkedAt: new Date(launchAt).toISOString(),
				}),
		});

		const row = rawSnapshotRow(db, config.id);
		expect(row?.writtenAt).toBe(launchAt);
		expect(row?.statusCheckedAt).toBe(launchAt);
		expect(row?.inventoryCheckedAt).toBe(launchAt);
	});

	it("writes immediately when an explicit refresh changes inventory", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		persistSnapshot(db, config);
		const launchAt = CHECKED_AT_MS + 31_000;

		await refreshAgentCapability(db, config, {
			now: launchAt,
			probe: async () =>
				liveSnapshot(config, {
					checkedAt: new Date(launchAt).toISOString(),
					models: [
						{
							id: "model-2",
							label: "Model 2",
							reasoning: { state: "unknown" },
						},
					],
				}),
		});

		const row = rawSnapshotRow(db, config.id);
		expect(row?.writtenAt).toBe(launchAt);
		expect(row?.statusCheckedAt).toBe(launchAt);
		expect(row?.inventoryJson).toContain("model-2");
		expect(row?.inventoryJson).not.toContain("model-1");
	});

	it("advances statusCheckedAt when a repeated transient failure is probed", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		persistSnapshot(db, config);
		const firstAt = CHECKED_AT_MS + 10_000;
		const secondAt = firstAt + 31_000;

		const probe = async (
			_config: AgentCapabilityConfig,
			options: { now?: number },
		): Promise<AgentCapabilitySnapshot> =>
			liveSnapshot(config, {
				status: "unavailable",
				auth: "unknown",
				modelSource: "none",
				models: [],
				errorKind: "timeout",
				checkedAt: new Date(options.now ?? firstAt).toISOString(),
			});

		await refreshAgentCapability(db, config, {
			now: firstAt,
			probe,
		});
		expect(rawSnapshotRow(db, config.id)?.statusCheckedAt).toBe(firstAt);

		await refreshAgentCapability(db, config, {
			now: secondAt,
			probe,
		});
		const row = rawSnapshotRow(db, config.id);
		expect(row?.statusCheckedAt).toBe(secondAt);
		expect(row?.writtenAt).toBe(secondAt);
		expect(row?.errorKind).toBe("timeout");
		expect(row?.inventoryJson).toContain("model-1");
	});

	it("rejects an obsolete revision on an explicit refresh", async () => {
		const db = createTestDb();
		const config = seedConfig(db);
		persistSnapshot(db, config);
		const launchAt = CHECKED_AT_MS + 31_000;

		await expect(
			refreshAgentCapability(db, config, {
				now: launchAt,
				probe: async () => {
					db.update(schema.hostAgentConfigs)
						.set({ capabilityRevision: 2 })
						.where(eq(schema.hostAgentConfigs.id, config.id))
						.run();
					return liveSnapshot(config, {
						checkedAt: new Date(launchAt).toISOString(),
					});
				},
			}),
		).rejects.toBeInstanceOf(ObsoleteCapabilityRefreshError);

		const row = rawSnapshotRow(db, config.id);
		expect(row?.writtenAt).toBe(CHECKED_AT_MS);
		expect(row?.configRevision).toBe(1);
		expect(row?.inventoryJson).toContain("model-1");
	});

	it("startup helper prune and hydrate spawn no agent processes", async () => {
		const spawnSpy = spyOn(childProcess, "spawn");
		const db = createTestDb();
		const recent = seedConfig(db, "agent-recent");
		const expired = seedConfig(db, "agent-expired");
		persistSnapshot(db, recent, CHECKED_AT_MS);
		persistSnapshot(
			db,
			expired,
			CHECKED_AT_MS - CAPABILITY_SNAPSHOT_RETENTION_MS - 1,
		);

		const { snapshots, capabilityRefresh } = initializeHostCapabilitySnapshots(
			db,
			CHECKED_AT_MS,
		);

		expect(spawnSpy).not.toHaveBeenCalled();
		expect(snapshots.map((view) => view.agentId)).toEqual([recent.id]);
		expect(rawSnapshotRow(db, expired.id)).toBeUndefined();
		await capabilityRefresh.dispose();
		spawnSpy.mockRestore();
	});

	it("settles aborted probe process trees before SQLite close", async () => {
		const sqlite = new Database(":memory:");
		const bunDb = drizzle(sqlite, { schema });
		migrate(bunDb, { migrationsFolder: MIGRATIONS_FOLDER });
		sqlite.exec("PRAGMA foreign_keys = ON");
		// SAFETY: This test uses only schema-bound operations shared by both synchronous Drizzle SQLite drivers.
		const db = bunDb as unknown as HostDb;
		const config = seedConfig(db);
		const service = new CapabilityRefreshService(db);
		const directory = await mkdtemp(
			join(tmpdir(), "superset-capability-dispose-"),
		);
		const executable = join(directory, "probe-tree");
		const parentPidFile = join(directory, "parent.pid");
		const childPidFile = join(directory, "child.pid");
		await writeFile(
			executable,
			`#!/bin/sh
echo $$ > "${parentPidFile}"
sleep 30 &
echo $! > "${childPidFile}"
wait
`,
		);
		await chmod(executable, 0o755);

		try {
			let sqliteClosedAt: number | null = null;
			let abortedAt: number | null = null;
			const refresh = service
				.refreshCapability(config, {
					probe: async (_probeConfig, options) => {
						try {
							await runCommand(
								executable,
								[],
								{},
								30_000,
								undefined,
								undefined,
								options.signal,
							);
						} catch (error) {
							abortedAt = Date.now();
							expect(sqliteClosedAt).toBeNull();
							throw error;
						}
						return liveSnapshot(config);
					},
				})
				.catch((error: unknown) => error);

			const parentPid = await waitForPidFile(parentPidFile);
			const childPid = await waitForPidFile(childPidFile);
			await service.dispose();
			expect(sqliteClosedAt).toBeNull();
			sqlite.close();
			sqliteClosedAt = Date.now();

			expect(await refresh).toBeInstanceOf(AgentCapabilityProbeAbortedError);
			expect(abortedAt).not.toBeNull();
			expect(sqliteClosedAt).toBeGreaterThanOrEqual(abortedAt ?? 0);
			await expectPidGone(parentPid);
			await expectPidGone(childPid);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
