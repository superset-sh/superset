import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import {
	getDefaultSeedPresets,
	getPresetById,
} from "@superset/shared/host-agent-presets";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { CapabilityRefreshService } from "../../../agent-capabilities/capability-refresh-service";
import { CAPABILITY_INVENTORY_SCHEMA_VERSION } from "../../../agent-capabilities/capability-snapshot-repository";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { agentConfigsRouter } from "./agent-configs";

function presetBody(presetId: string) {
	const preset = getPresetById(presetId);
	if (!preset) throw new Error(`unknown test preset ${presetId}`);
	const { description: _description, ...rest } = preset;
	return rest;
}

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	sqlite.exec("PRAGMA foreign_keys = ON");
	// SAFETY: Tests use Bun's SQLite driver, whose run result differs nominally from HostDb; router operations used here are otherwise identical.
	return db as unknown as HostDb;
}

function createCallerWithDb() {
	const db = createTestDb();
	const ctx = {
		db,
		capabilityRefresh: new CapabilityRefreshService(db),
		isAuthenticated: true,
	};
	// SAFETY: agentConfigsRouter uses only the database, refresh service, and authentication flag supplied here.
	const routerContext = ctx as HostServiceContext;
	return { db, caller: agentConfigsRouter.createCaller(routerContext) };
}

function createCaller() {
	return createCallerWithDb().caller;
}

function insertHealthSnapshot(
	db: ReturnType<typeof createTestDb>,
	config: { id: string; presetId: string; capabilityRevision?: number },
) {
	db.delete(schema.hostAgentCapabilitySnapshots)
		.where(eq(schema.hostAgentCapabilitySnapshots.agentId, config.id))
		.run();
	db.insert(schema.hostAgentCapabilitySnapshots)
		.values({
			agentId: config.id,
			presetId: config.presetId,
			configRevision: config.capabilityRevision ?? 1,
			schemaVersion: CAPABILITY_INVENTORY_SCHEMA_VERSION,
			inventoryJson: null,
			status: "ready",
			installed: true,
			auth: "authenticated",
			inventoryCheckedAt: null,
			statusCheckedAt: Date.now(),
			writtenAt: Date.now(),
		})
		.run();
}

async function listFirst(
	caller: ReturnType<typeof agentConfigsRouter.createCaller>,
) {
	const rows = await caller.list();
	const first = rows[0];
	if (!first) throw new Error("expected seeded rows but list was empty");
	return first;
}

const DEFAULT_PRESET_IDS = getDefaultSeedPresets().map((p) => p.presetId);
const DEFAULT_PRESET_ORDERS = DEFAULT_PRESET_IDS.map((_, i) => i);

describe("agentConfigsRouter", () => {
	describe("list()", () => {
		it("seeds bundled defaults alphabetically", () => {
			const labels = getDefaultSeedPresets().map((preset) => preset.label);
			expect(labels).toEqual(
				[...labels].sort((left, right) => left.localeCompare(right)),
			);
		});

		it("seeds bundled defaults on first call", async () => {
			const caller = createCaller();

			const result = await caller.list();

			expect(result.map((row) => row.presetId)).toEqual(DEFAULT_PRESET_IDS);
			expect(result.map((row) => row.order)).toEqual(DEFAULT_PRESET_ORDERS);
		});

		it("does not seed Superset", async () => {
			const caller = createCaller();
			const result = await caller.list();
			expect(result.find((row) => row.presetId === "superset")).toBeUndefined();
		});

		it("seeds Claude with its most permissive flag", async () => {
			const caller = createCaller();
			const result = await caller.list();
			const claude = result.find((row) => row.presetId === "claude");

			expect(claude?.args).toEqual(["--dangerously-skip-permissions"]);
		});

		it("seeds Codex with its most permissive flags", async () => {
			const caller = createCaller();
			const result = await caller.list();
			const codex = result.find((row) => row.presetId === "codex");

			expect(codex?.args).toContain(
				"--dangerously-bypass-approvals-and-sandbox",
			);
			expect(codex?.args).toEqual([
				"--dangerously-bypass-approvals-and-sandbox",
				"--dangerously-bypass-hook-trust",
			]);
			expect(codex?.args).not.toContain("--sandbox");
			expect(codex?.args).not.toContain("--ask-for-approval");
		});

		it("seeds resume args for agents with an id-based resume", async () => {
			const caller = createCaller();
			const result = await caller.list();

			const claude = result.find((row) => row.presetId === "claude");
			expect(claude?.resumeArgs).toEqual(["--resume"]);

			const amp = result.find((row) => row.presetId === "amp");
			expect(amp?.resumeArgs).toEqual(["threads", "continue"]);

			const codex = result.find((row) => row.presetId === "codex");
			expect(codex?.resumeArgs).toEqual(["resume"]);
		});

		it("returns existing rows on subsequent calls without re-seeding", async () => {
			const caller = createCaller();
			const first = await caller.list();
			const second = await caller.list();
			expect(second.map((row) => row.id)).toEqual(first.map((row) => row.id));
		});

		it("returns rows in displayOrder", async () => {
			const caller = createCaller();
			const seeded = await caller.list();
			await caller.reorder({
				ids: [...seeded.map((row) => row.id)].reverse(),
			});

			const reordered = await caller.list();
			expect(reordered.map((row) => row.presetId)).toEqual(
				[...DEFAULT_PRESET_IDS].reverse(),
			);
			expect(reordered.map((row) => row.order)).toEqual(DEFAULT_PRESET_ORDERS);
		});
	});

	describe("capability snapshots", () => {
		it("reads persisted health without probing the configured command", async () => {
			const { db, caller } = createCallerWithDb();
			const config = await caller.add({
				label: "Cached only",
				command: "/definitely/not/an/executable",
				args: [],
				promptTransport: "argv",
				promptArgs: [],
				env: {},
			});
			insertHealthSnapshot(db, config);

			const snapshots = await caller.listCapabilitySnapshots();

			const snapshot = snapshots.find((entry) => entry.agentId === config.id);
			expect(snapshot).toEqual({
				agentId: config.id,
				presetId: config.presetId,
				inventory: null,
				inventoryOrigin: "none",
				health: {
					status: "ready",
					installed: true,
					auth: "authenticated",
					checkedAt: expect.any(String),
					errorKind: null,
					message: null,
				},
				healthOrigin: "persisted",
			});
			expect(Object.keys(snapshot ?? {}).sort()).toEqual([
				"agentId",
				"health",
				"healthOrigin",
				"inventory",
				"inventoryOrigin",
				"presetId",
			]);
		});

		it("preserves unknown installed null on the read-only snapshot API", async () => {
			const { db, caller } = createCallerWithDb();
			const config = await caller.add({
				label: "Unknown install",
				command: "/definitely/not/an/executable",
				args: [],
				promptTransport: "argv",
				promptArgs: [],
				env: {},
			});
			db.delete(schema.hostAgentCapabilitySnapshots)
				.where(eq(schema.hostAgentCapabilitySnapshots.agentId, config.id))
				.run();
			db.insert(schema.hostAgentCapabilitySnapshots)
				.values({
					agentId: config.id,
					presetId: config.presetId,
					configRevision: 1,
					schemaVersion: CAPABILITY_INVENTORY_SCHEMA_VERSION,
					inventoryJson: null,
					status: "unknown",
					installed: null,
					auth: "unknown",
					inventoryCheckedAt: null,
					statusCheckedAt: Date.now(),
					writtenAt: Date.now(),
				})
				.run();

			const snapshots = await caller.listCapabilitySnapshots();
			expect(
				snapshots.find((snapshot) => snapshot.agentId === config.id),
			).toMatchObject({
				inventory: null,
				inventoryOrigin: "none",
				health: {
					status: "unknown",
					installed: null,
					auth: "unknown",
				},
				healthOrigin: "persisted",
			});
		});

		it("targeted refresh probes even with a recent persisted snapshot", async () => {
			const { db, caller } = createCallerWithDb();
			const config = await caller.add({
				label: "Fresh cached agent",
				command: "/definitely/not/an/executable",
				args: [],
				promptTransport: "argv",
				promptArgs: [],
				env: {},
			});
			insertHealthSnapshot(db, config);

			const refreshed = await caller.refreshCapabilities({
				agentIds: [config.id],
			});

			expect(refreshed).toHaveLength(1);
			expect(refreshed[0]).toMatchObject({
				agentId: config.id,
				inventory: null,
				inventoryOrigin: "none",
				health: {
					status: "unavailable",
					installed: false,
					auth: "unknown",
				},
				healthOrigin: "live",
			});
		});
	});

	describe("add()", () => {
		it("inserts a row with the supplied launch shape and next order", async () => {
			const caller = createCaller();
			await caller.list();

			const created = await caller.add(presetBody("pi"));

			expect(created.presetId).toBe("pi");
			expect(created.command).toBe("pi");
			expect(created.promptTransport).toBe("argv");
			expect(created.order).toBe(DEFAULT_PRESET_IDS.length);
			const all = await caller.list();
			expect(all).toHaveLength(DEFAULT_PRESET_IDS.length + 1);
			expect(new Set(all.map((row) => row.id)).size).toBe(
				DEFAULT_PRESET_IDS.length + 1,
			);
		});

		it("allows duplicate presetId tags with distinct ids", async () => {
			const caller = createCaller();
			await caller.list();

			const a = await caller.add(presetBody("claude"));
			const b = await caller.add(presetBody("claude"));

			expect(a.id).not.toBe(b.id);
			const claudes = (await caller.list()).filter(
				(row) => row.presetId === "claude",
			);
			expect(claudes).toHaveLength(3);
		});

		it("accepts a fully custom row and defaults presetId to 'custom'", async () => {
			const caller = createCaller();
			await caller.list();

			const created = await caller.add({
				label: "My Agent",
				command: "my-agent",
				args: ["--flag"],
				promptTransport: "argv",
				promptArgs: [],
				env: { FOO: "bar" },
			});

			expect(created.presetId).toBe("custom");
			expect(created.label).toBe("My Agent");
			expect(created.command).toBe("my-agent");
			expect(created.args).toEqual(["--flag"]);
			expect(created.env).toEqual({ FOO: "bar" });
			// Omitted resumeArgs default to "no id-based resume".
			expect(created.resumeArgs).toEqual([]);
		});

		it("stores supplied resumeArgs", async () => {
			const caller = createCaller();
			await caller.list();

			const created = await caller.add({
				label: "Resumable",
				command: "resumable",
				args: [],
				promptTransport: "argv",
				promptArgs: [],
				resumeArgs: ["--resume"],
				env: {},
			});

			expect(created.resumeArgs).toEqual(["--resume"]);
		});

		it("preserves an arbitrary presetId tag verbatim", async () => {
			const caller = createCaller();
			await caller.list();

			const created = await caller.add({
				label: "Bespoke",
				command: "bespoke",
				args: [],
				promptTransport: "argv",
				promptArgs: [],
				env: {},
				presetId: "my-bespoke-tag",
			});

			expect(created.presetId).toBe("my-bespoke-tag");
		});

		it("defaults iconId to null and stores a supplied iconId", async () => {
			const caller = createCaller();
			await caller.list();

			const withoutIcon = await caller.add({
				label: "No Icon",
				command: "no-icon",
				args: [],
				promptTransport: "argv",
				promptArgs: [],
				env: {},
			});
			expect(withoutIcon.iconId).toBeNull();

			const withIcon = await caller.add({
				label: "Iconic",
				command: "iconic",
				args: [],
				promptTransport: "argv",
				promptArgs: [],
				env: {},
				presetId: "custom",
				iconId: "claude",
			});
			expect(withIcon.iconId).toBe("claude");
		});

		it("stores an uploaded data-URI icon", async () => {
			const caller = createCaller();
			await caller.list();

			const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANS";
			const created = await caller.add({
				label: "Uploaded",
				command: "uploaded",
				args: [],
				promptTransport: "argv",
				promptArgs: [],
				env: {},
				iconId: dataUrl,
			});

			expect(created.iconId).toBe(dataUrl);
		});

		it("rejects an oversized iconId", async () => {
			const caller = createCaller();
			await caller.list();

			await expect(
				caller.add({
					label: "Too Big",
					command: "too-big",
					args: [],
					promptTransport: "argv",
					promptArgs: [],
					env: {},
					iconId: `data:image/png;base64,${"A".repeat(256 * 1024)}`,
				}),
			).rejects.toThrow();
		});

		it("seeds bundled defaults with a null iconId", async () => {
			const caller = createCaller();
			const rows = await caller.list();
			expect(rows.every((row) => row.iconId === null)).toBe(true);
		});

		it("rejects empty label or command", async () => {
			const caller = createCaller();
			await expect(
				caller.add({
					label: "",
					command: "x",
					args: [],
					promptTransport: "argv",
					promptArgs: [],
					env: {},
				}),
			).rejects.toThrow();
			await expect(
				caller.add({
					label: "x",
					command: "",
					args: [],
					promptTransport: "argv",
					promptArgs: [],
					env: {},
				}),
			).rejects.toThrow();
		});
	});

	describe("update()", () => {
		it("persists label, command, args, promptTransport, promptArgs, resumeArgs, env", async () => {
			const caller = createCaller();
			const first = await listFirst(caller);

			const updated = await caller.update({
				id: first.id,
				patch: {
					label: "Custom Claude",
					command: "claude-yolo",
					args: ["--mode", "fast"],
					promptTransport: "stdin",
					promptArgs: ["-X"],
					resumeArgs: ["--continue-session"],
					env: { ANTHROPIC_API_KEY: "test" },
				},
			});

			expect(updated.label).toBe("Custom Claude");
			expect(updated.command).toBe("claude-yolo");
			expect(updated.args).toEqual(["--mode", "fast"]);
			expect(updated.promptTransport).toBe("stdin");
			expect(updated.promptArgs).toEqual(["-X"]);
			expect(updated.resumeArgs).toEqual(["--continue-session"]);
			expect(updated.env).toEqual({ ANTHROPIC_API_KEY: "test" });
		});

		it("sets and clears iconId", async () => {
			const caller = createCaller();
			const created = await caller.add({
				label: "Custom",
				command: "custom",
				args: [],
				promptTransport: "argv",
				promptArgs: [],
				env: {},
			});
			expect(created.iconId).toBeNull();

			const set = await caller.update({
				id: created.id,
				patch: { iconId: "codex" },
			});
			expect(set.iconId).toBe("codex");

			const cleared = await caller.update({
				id: created.id,
				patch: { iconId: null },
			});
			expect(cleared.iconId).toBeNull();
		});

		it("increments capability revision and deletes snapshots for command, args, and env changes", async () => {
			const { db, caller } = createCallerWithDb();
			const first = await listFirst(caller);
			const original = db
				.select()
				.from(schema.hostAgentConfigs)
				.where(eq(schema.hostAgentConfigs.id, first.id))
				.get();
			expect(original).toBeDefined();
			if (!original) return;
			insertHealthSnapshot(db, original);

			await caller.update({
				id: first.id,
				patch: { command: `${first.command}-new` },
			});
			const afterCommand = db
				.select()
				.from(schema.hostAgentConfigs)
				.where(eq(schema.hostAgentConfigs.id, first.id))
				.get();
			expect(afterCommand?.capabilityRevision).toBe(
				original.capabilityRevision + 1,
			);
			expect(
				db
					.select()
					.from(schema.hostAgentCapabilitySnapshots)
					.where(eq(schema.hostAgentCapabilitySnapshots.agentId, first.id))
					.get()?.configRevision,
			).toBe(afterCommand?.capabilityRevision);

			expect(afterCommand).toBeDefined();
			if (!afterCommand) return;
			insertHealthSnapshot(db, afterCommand);
			await caller.update({
				id: first.id,
				patch: { args: [...first.args, "--new-discovery-arg"] },
			});
			const afterArgs = db
				.select()
				.from(schema.hostAgentConfigs)
				.where(eq(schema.hostAgentConfigs.id, first.id))
				.get();
			expect(afterArgs?.capabilityRevision).toBe(
				afterCommand.capabilityRevision + 1,
			);
			expect(
				db
					.select()
					.from(schema.hostAgentCapabilitySnapshots)
					.where(eq(schema.hostAgentCapabilitySnapshots.agentId, first.id))
					.get()?.configRevision,
			).toBe(afterArgs?.capabilityRevision);

			expect(afterArgs).toBeDefined();
			if (!afterArgs) return;
			insertHealthSnapshot(db, afterArgs);
			await caller.update({
				id: first.id,
				patch: { env: { TEST_CAPABILITY_ENV: "changed" } },
			});
			const afterEnv = db
				.select()
				.from(schema.hostAgentConfigs)
				.where(eq(schema.hostAgentConfigs.id, first.id))
				.get();
			expect(afterEnv?.capabilityRevision).toBe(
				afterArgs.capabilityRevision + 1,
			);
			expect(
				db
					.select()
					.from(schema.hostAgentCapabilitySnapshots)
					.where(eq(schema.hostAgentCapabilitySnapshots.agentId, first.id))
					.get()?.configRevision,
			).toBe(afterEnv?.capabilityRevision);
		});

		it("preserves capability revision and snapshots for launch-only or display changes", async () => {
			const { db, caller } = createCallerWithDb();
			const first = await listFirst(caller);
			const original = db
				.select()
				.from(schema.hostAgentConfigs)
				.where(eq(schema.hostAgentConfigs.id, first.id))
				.get();
			expect(original).toBeDefined();
			if (!original) return;
			insertHealthSnapshot(db, original);

			await caller.update({
				id: first.id,
				patch: {
					label: "Display Only",
					command: first.command,
					promptArgs: ["--prompt"],
					resumeArgs: ["--resume-new"],
					iconId: "codex",
					env: { ...first.env },
				},
			});
			const updated = db
				.select()
				.from(schema.hostAgentConfigs)
				.where(eq(schema.hostAgentConfigs.id, first.id))
				.get();
			expect(updated?.capabilityRevision).toBe(original.capabilityRevision);
			expect(
				db
					.select()
					.from(schema.hostAgentCapabilitySnapshots)
					.where(eq(schema.hostAgentCapabilitySnapshots.agentId, first.id))
					.get(),
			).toBeDefined();
		});

		it("rejects invalid promptTransport", async () => {
			const caller = createCaller();
			const first = await listFirst(caller);
			await expect(
				caller.update({
					id: first.id,
					// biome-ignore lint/suspicious/noExplicitAny: testing invalid input
					patch: { promptTransport: "file" as any },
				}),
			).rejects.toThrow();
		});

		it("rejects an empty patch", async () => {
			const caller = createCaller();
			const first = await listFirst(caller);
			await expect(
				caller.update({ id: first.id, patch: {} }),
			).rejects.toThrow();
		});

		it("rejects update for missing id", async () => {
			const caller = createCaller();
			await expect(
				caller.update({ id: "does-not-exist", patch: { label: "x" } }),
			).rejects.toThrow();
		});

		it("rejects whitespace-only label and command", async () => {
			const caller = createCaller();
			const first = await listFirst(caller);
			await expect(
				caller.update({ id: first.id, patch: { label: "   " } }),
			).rejects.toThrow();
			await expect(
				caller.update({ id: first.id, patch: { command: "   " } }),
			).rejects.toThrow();
		});

		it("trims label and command on save", async () => {
			const caller = createCaller();
			const first = await listFirst(caller);
			const result = await caller.update({
				id: first.id,
				patch: { label: "  Trimmed  ", command: "  trimmed-cmd  " },
			});
			expect(result.label).toBe("Trimmed");
			expect(result.command).toBe("trimmed-cmd");
		});
	});

	describe("remove()", () => {
		it("deletes a config by id", async () => {
			const { db, caller } = createCallerWithDb();
			const first = await listFirst(caller);
			const row = db
				.select()
				.from(schema.hostAgentConfigs)
				.where(eq(schema.hostAgentConfigs.id, first.id))
				.get();
			expect(row).toBeDefined();
			if (!row) return;
			insertHealthSnapshot(db, row);

			const result = await caller.remove({ id: first.id });

			expect(result.success).toBe(true);
			const remaining = await caller.list();
			expect(remaining.find((row) => row.id === first.id)).toBeUndefined();
			expect(
				db
					.select()
					.from(schema.hostAgentCapabilitySnapshots)
					.where(eq(schema.hostAgentCapabilitySnapshots.agentId, first.id))
					.get(),
			).toBeUndefined();
		});

		it("throws NOT_FOUND for an unknown id", async () => {
			const caller = createCaller();
			await caller.list();
			await expect(caller.remove({ id: "does-not-exist" })).rejects.toThrow(
				/not found/i,
			);
		});
	});

	describe("restoreDefault()", () => {
		it("repairs a malformed built-in config without replacing its row", async () => {
			const { db, caller } = createCallerWithDb();
			const configs = await caller.list();
			const codex = configs.find((row) => row.presetId === "codex");
			expect(codex).toBeDefined();
			if (!codex) return;

			await caller.update({
				id: codex.id,
				patch: {
					label: "Broken Codex",
					command: "codex",
					args: [
						"-c",
						"model_reasoning_summary=detailed",
						" ",
						"--dangerously-bypass-approvals-and-sandbox",
					],
					promptTransport: "stdin",
					promptArgs: ["--prompt"],
					resumeArgs: ["--wrong-resume"],
					env: { CODEX_HOME: "/tmp/old-codex" },
					iconId: "claude",
				},
			});
			const broken = db
				.select()
				.from(schema.hostAgentConfigs)
				.where(eq(schema.hostAgentConfigs.id, codex.id))
				.get();
			expect(broken).toBeDefined();
			if (!broken) return;
			insertHealthSnapshot(db, broken);

			const restored = await caller.restoreDefault({ id: codex.id });
			const preset = getPresetById("codex");
			expect(preset).toBeDefined();
			if (!preset) return;

			expect(restored).toMatchObject({
				id: codex.id,
				presetId: "codex",
				iconId: null,
				label: preset.label,
				command: preset.command,
				args: preset.args,
				promptTransport: preset.promptTransport,
				promptArgs: preset.promptArgs,
				resumeArgs: preset.resumeArgs,
				env: preset.env,
				order: codex.order,
			});
			const restoredRow = db
				.select()
				.from(schema.hostAgentConfigs)
				.where(eq(schema.hostAgentConfigs.id, codex.id))
				.get();
			expect(restoredRow?.capabilityRevision).toBe(
				broken.capabilityRevision + 1,
			);
			expect(
				db
					.select()
					.from(schema.hostAgentCapabilitySnapshots)
					.where(eq(schema.hostAgentCapabilitySnapshots.agentId, codex.id))
					.get()?.configRevision,
			).toBe(restoredRow?.capabilityRevision);
		});

		it("rejects custom agents and unknown ids", async () => {
			const caller = createCaller();
			const custom = await caller.add({
				label: "Custom",
				command: "custom",
				args: [],
				promptTransport: "argv",
				promptArgs: [],
				env: {},
			});

			await expect(caller.restoreDefault({ id: custom.id })).rejects.toThrow(
				/no bundled default/i,
			);
			await expect(
				caller.restoreDefault({ id: "does-not-exist" }),
			).rejects.toThrow(/not found/i);
		});
	});

	describe("reorder()", () => {
		it("persists the submitted id order", async () => {
			const { db, caller } = createCallerWithDb();
			const seeded = await caller.list();
			const firstRow = db
				.select()
				.from(schema.hostAgentConfigs)
				.where(eq(schema.hostAgentConfigs.id, seeded[0]?.id ?? ""))
				.get();
			expect(firstRow).toBeDefined();
			if (!firstRow) return;
			insertHealthSnapshot(db, firstRow);
			const reversed = [...seeded.map((row) => row.id)].reverse();

			const result = await caller.reorder({ ids: reversed });

			expect(result.map((row) => row.id)).toEqual(reversed);
			expect(result.map((row) => row.order)).toEqual(DEFAULT_PRESET_ORDERS);
			expect(
				db
					.select()
					.from(schema.hostAgentCapabilitySnapshots)
					.where(eq(schema.hostAgentCapabilitySnapshots.agentId, firstRow.id))
					.get(),
			).toBeDefined();
		});

		it("rejects when ids do not match existing configs", async () => {
			const caller = createCaller();
			const seeded = await caller.list();

			await expect(
				caller.reorder({
					ids: [...seeded.slice(0, 2).map((row) => row.id)],
				}),
			).rejects.toThrow();
		});

		it("rejects duplicate ids", async () => {
			const caller = createCaller();
			const first = await listFirst(caller);
			await expect(
				caller.reorder({ ids: [first.id, first.id] }),
			).rejects.toThrow();
		});
	});

	describe("resetToDefaults()", () => {
		it("replaces current configs with bundled defaults", async () => {
			const { db, caller } = createCallerWithDb();
			const seedFirst = await listFirst(caller);
			const originalRow = db
				.select()
				.from(schema.hostAgentConfigs)
				.where(eq(schema.hostAgentConfigs.id, seedFirst.id))
				.get();
			expect(originalRow).toBeDefined();
			if (!originalRow) return;
			insertHealthSnapshot(db, originalRow);
			await caller.update({
				id: seedFirst.id,
				patch: { label: "Renamed" },
			});
			await caller.add(presetBody("pi"));

			const result = await caller.resetToDefaults();

			expect(result.map((row) => row.presetId)).toEqual(DEFAULT_PRESET_IDS);
			expect(result.find((row) => row.label === "Renamed")).toBeUndefined();
			// `pi` is in defaults now, so reset re-seeds exactly one — the
			// extra row added above is dropped.
			expect(result.filter((row) => row.presetId === "pi")).toHaveLength(1);
			expect(
				db
					.select()
					.from(schema.hostAgentCapabilitySnapshots)
					.where(eq(schema.hostAgentCapabilitySnapshots.agentId, seedFirst.id))
					.get(),
			).toBeUndefined();
		}, 15_000);
	});
});
