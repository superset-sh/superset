import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import {
	getDefaultSeedPresets,
	getPresetById,
} from "@superset/shared/host-agent-presets";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
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

const DEFAULT_PRESET_IDS = getDefaultSeedPresets().map((p) => p.presetId);
const DEFAULT_PRESET_ORDERS = DEFAULT_PRESET_IDS.map((_, i) => i);

describe("agentConfigsRouter", () => {
	describe("list()", () => {
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

		it("seeds Codex with its most permissive flag", async () => {
			const caller = createCaller();
			const result = await caller.list();
			const codex = result.find((row) => row.presetId === "codex");

			expect(codex?.args).toContain(
				"--dangerously-bypass-approvals-and-sandbox",
			);
			expect(codex?.args).toEqual([
				"--dangerously-bypass-approvals-and-sandbox",
			]);
			expect(codex?.args).not.toContain("--sandbox");
			expect(codex?.args).not.toContain("--ask-for-approval");
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
			expect(result.map((row) => row.order)).toEqual(DEFAULT_PRESET_ORDERS);
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
			await caller.add(presetBody("pi"));

			const result = await caller.resetToDefaults();

			expect(result.map((row) => row.presetId)).toEqual(DEFAULT_PRESET_IDS);
			expect(result.find((row) => row.label === "Renamed")).toBeUndefined();
			// `pi` is in defaults now, so reset re-seeds exactly one — the
			// extra row added above is dropped.
			expect(result.filter((row) => row.presetId === "pi")).toHaveLength(1);
		});
	});
});
