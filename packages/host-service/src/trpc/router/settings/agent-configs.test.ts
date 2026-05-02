import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { agentConfigsRouter } from "./agent-configs";
import { AGENT_PRESETS } from "./agent-presets";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createTestDb() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db;
}

function createCaller() {
	const db = createTestDb();
	const ctx = { db, isAuthenticated: true } as unknown as HostServiceContext;
	return agentConfigsRouter.createCaller(ctx);
}

async function listFirst(
	caller: ReturnType<typeof agentConfigsRouter.createCaller>,
) {
	const rows = await caller.list();
	const first = rows[0];
	if (!first) throw new Error("expected seeded rows but list was empty");
	return first;
}

const DEFAULT_PRESET_IDS = ["claude", "amp", "codex", "gemini", "copilot"];

describe("agentConfigsRouter", () => {
	describe("list()", () => {
		it("seeds bundled defaults on first call", async () => {
			const caller = createCaller();

			const result = await caller.list();

			expect(result.map((row) => row.presetId)).toEqual(DEFAULT_PRESET_IDS);
			expect(result.map((row) => row.order)).toEqual([0, 1, 2, 3, 4]);
		});

		it("does not seed Superset Chat", async () => {
			const caller = createCaller();
			const result = await caller.list();
			expect(
				result.find((row) => row.presetId === "superset-chat"),
			).toBeUndefined();
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
			expect(reordered.map((row) => row.order)).toEqual([0, 1, 2, 3, 4]);
		});
	});

	describe("listPresets()", () => {
		it("returns the full hardcoded preset catalog", async () => {
			const caller = createCaller();
			const presets = await caller.listPresets();
			expect(presets.map((preset) => preset.presetId)).toEqual(
				AGENT_PRESETS.map((preset) => preset.presetId),
			);
		});
	});

	describe("add()", () => {
		it("copies preset fields and assigns a unique id and next order", async () => {
			const caller = createCaller();
			await caller.list();

			const created = await caller.add({ presetId: "pi" });

			expect(created.presetId).toBe("pi");
			expect(created.command).toBe("pi");
			expect(created.promptTransport).toBe("argv");
			expect(created.order).toBe(5);
			const all = await caller.list();
			expect(all).toHaveLength(6);
			expect(new Set(all.map((row) => row.id)).size).toBe(6);
		});

		it("allows duplicate presetId entries with distinct ids", async () => {
			const caller = createCaller();
			await caller.list();

			const a = await caller.add({ presetId: "claude" });
			const b = await caller.add({ presetId: "claude" });

			expect(a.id).not.toBe(b.id);
			const claudes = (await caller.list()).filter(
				(row) => row.presetId === "claude",
			);
			expect(claudes).toHaveLength(3);
		});

		it("rejects unknown presetId", async () => {
			const caller = createCaller();
			await expect(
				caller.add({ presetId: "nonexistent-preset" }),
			).rejects.toThrow();
		});
	});

	describe("update()", () => {
		it("persists label, command, args, promptTransport, promptArgs, env", async () => {
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
					env: { ANTHROPIC_API_KEY: "test" },
				},
			});

			expect(updated.label).toBe("Custom Claude");
			expect(updated.command).toBe("claude-yolo");
			expect(updated.args).toEqual(["--mode", "fast"]);
			expect(updated.promptTransport).toBe("stdin");
			expect(updated.promptArgs).toEqual(["-X"]);
			expect(updated.env).toEqual({ ANTHROPIC_API_KEY: "test" });
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
			const caller = createCaller();
			const first = await listFirst(caller);

			const result = await caller.remove({ id: first.id });

			expect(result.success).toBe(true);
			const remaining = await caller.list();
			expect(remaining.find((row) => row.id === first.id)).toBeUndefined();
		});

		it("throws NOT_FOUND for an unknown id", async () => {
			const caller = createCaller();
			await caller.list();
			await expect(caller.remove({ id: "does-not-exist" })).rejects.toThrow(
				/not found/i,
			);
		});
	});

	describe("reorder()", () => {
		it("persists the submitted id order", async () => {
			const caller = createCaller();
			const seeded = await caller.list();
			const reversed = [...seeded.map((row) => row.id)].reverse();

			const result = await caller.reorder({ ids: reversed });

			expect(result.map((row) => row.id)).toEqual(reversed);
			expect(result.map((row) => row.order)).toEqual([0, 1, 2, 3, 4]);
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
			const caller = createCaller();
			const seedFirst = await listFirst(caller);
			await caller.update({
				id: seedFirst.id,
				patch: { label: "Renamed" },
			});
			await caller.add({ presetId: "pi" });

			const result = await caller.resetToDefaults();

			expect(result.map((row) => row.presetId)).toEqual(DEFAULT_PRESET_IDS);
			expect(result.find((row) => row.label === "Renamed")).toBeUndefined();
			expect(result.find((row) => row.presetId === "pi")).toBeUndefined();
		});
	});
});
