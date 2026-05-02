import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../db";
import { hostAgentConfigs } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";
import {
	AGENT_PRESETS,
	type AgentPreset,
	getDefaultSeedPresets,
	getPresetById,
	type PromptTransport,
} from "./agent-presets";

const promptTransportSchema = z.enum(["argv", "stdin"]);

const presetIdSchema = z
	.string()
	.refine((value) => getPresetById(value) !== undefined, {
		message: "Unknown presetId",
	});

const argvSchema = z.array(z.string());
const envSchema = z.record(z.string(), z.string());

interface HostAgentConfigOutput {
	id: string;
	presetId: string;
	label: string;
	command: string;
	args: string[];
	promptTransport: PromptTransport;
	promptArgs: string[];
	env: Record<string, string>;
	order: number;
}

interface HostAgentConfigRow {
	id: string;
	presetId: string;
	label: string;
	command: string;
	argsJson: string;
	promptTransport: string;
	promptArgsJson: string;
	envJson: string;
	displayOrder: number;
}

function parseArgv(value: string): string[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return [];
	}
	if (
		!Array.isArray(parsed) ||
		parsed.some((item) => typeof item !== "string")
	) {
		return [];
	}
	return parsed as string[];
}

function parseEnv(value: string): Record<string, string> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return {};
	}
	if (
		parsed === null ||
		typeof parsed !== "object" ||
		Array.isArray(parsed) ||
		Object.values(parsed).some((item) => typeof item !== "string")
	) {
		return {};
	}
	return parsed as Record<string, string>;
}

function toOutput(row: HostAgentConfigRow): HostAgentConfigOutput {
	return {
		id: row.id,
		presetId: row.presetId,
		label: row.label,
		command: row.command,
		args: parseArgv(row.argsJson),
		promptTransport: row.promptTransport as PromptTransport,
		promptArgs: parseArgv(row.promptArgsJson),
		env: parseEnv(row.envJson),
		order: row.displayOrder,
	};
}

function rowFromPreset(
	preset: AgentPreset,
	displayOrder: number,
): typeof hostAgentConfigs.$inferInsert {
	return {
		id: randomUUID(),
		presetId: preset.presetId,
		label: preset.label,
		command: preset.command,
		argsJson: JSON.stringify(preset.args),
		promptTransport: preset.promptTransport,
		promptArgsJson: JSON.stringify(preset.promptArgs),
		envJson: JSON.stringify(preset.env),
		displayOrder,
	};
}

function listOrdered(db: HostDb): HostAgentConfigRow[] {
	return db
		.select()
		.from(hostAgentConfigs)
		.orderBy(asc(hostAgentConfigs.displayOrder))
		.all();
}

function seedDefaultsIfEmpty(db: HostDb): HostAgentConfigRow[] {
	const existing = listOrdered(db);
	if (existing.length > 0) return existing;
	const seeds = getDefaultSeedPresets().map((preset, index) =>
		rowFromPreset(preset, index),
	);
	if (seeds.length === 0) return existing;
	db.insert(hostAgentConfigs).values(seeds).run();
	return listOrdered(db);
}

const updatePatchSchema = z
	.object({
		label: z.string().trim().min(1).optional(),
		command: z.string().trim().min(1).optional(),
		args: argvSchema.optional(),
		promptTransport: promptTransportSchema.optional(),
		promptArgs: argvSchema.optional(),
		env: envSchema.optional(),
	})
	.refine(
		(patch) =>
			patch.label !== undefined ||
			patch.command !== undefined ||
			patch.args !== undefined ||
			patch.promptTransport !== undefined ||
			patch.promptArgs !== undefined ||
			patch.env !== undefined,
		{ message: "Patch must update at least one field" },
	);

export const agentConfigsRouter = router({
	/**
	 * List configured host agents in persisted order. Seeds bundled defaults
	 * on first call when no configs exist.
	 */
	list: protectedProcedure.query(({ ctx }) => {
		const rows = seedDefaultsIfEmpty(ctx.db);
		return rows.map(toOutput);
	}),

	/**
	 * Available add templates. Returns the hardcoded preset list — the UI
	 * uses this to render the "add agent" picker.
	 */
	listPresets: protectedProcedure.query(() =>
		AGENT_PRESETS.map((preset) => ({
			...preset,
			args: [...preset.args],
			promptArgs: [...preset.promptArgs],
			env: { ...preset.env },
		})),
	),

	/**
	 * Create a new host agent config from a hardcoded preset. Allows
	 * duplicate `presetId` entries — each gets a fresh `id`.
	 */
	add: protectedProcedure
		.input(z.object({ presetId: presetIdSchema }))
		.mutation(({ ctx, input }) => {
			const preset = getPresetById(input.presetId);
			if (!preset) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Unknown presetId: ${input.presetId}`,
				});
			}
			const existing = listOrdered(ctx.db);
			const nextOrder =
				existing.length === 0
					? 0
					: Math.max(...existing.map((row) => row.displayOrder)) + 1;
			const insert = rowFromPreset(preset, nextOrder);
			ctx.db.insert(hostAgentConfigs).values(insert).run();
			const created = ctx.db
				.select()
				.from(hostAgentConfigs)
				.where(eq(hostAgentConfigs.id, insert.id))
				.get();
			if (!created) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to read back inserted host agent config",
				});
			}
			return toOutput(created);
		}),

	/**
	 * Update editable fields on an existing config. `presetId` and `order`
	 * are not mutable.
	 */
	update: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1),
				patch: updatePatchSchema,
			}),
		)
		.mutation(({ ctx, input }) => {
			const existing = ctx.db
				.select()
				.from(hostAgentConfigs)
				.where(eq(hostAgentConfigs.id, input.id))
				.get();
			if (!existing) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Host agent config not found: ${input.id}`,
				});
			}
			const update: Partial<typeof hostAgentConfigs.$inferInsert> = {
				updatedAt: Date.now(),
			};
			if (input.patch.label !== undefined) update.label = input.patch.label;
			if (input.patch.command !== undefined)
				update.command = input.patch.command;
			if (input.patch.args !== undefined)
				update.argsJson = JSON.stringify(input.patch.args);
			if (input.patch.promptTransport !== undefined)
				update.promptTransport = input.patch.promptTransport;
			if (input.patch.promptArgs !== undefined)
				update.promptArgsJson = JSON.stringify(input.patch.promptArgs);
			if (input.patch.env !== undefined)
				update.envJson = JSON.stringify(input.patch.env);
			ctx.db
				.update(hostAgentConfigs)
				.set(update)
				.where(eq(hostAgentConfigs.id, input.id))
				.run();
			const updated = ctx.db
				.select()
				.from(hostAgentConfigs)
				.where(eq(hostAgentConfigs.id, input.id))
				.get();
			if (!updated) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to read back updated host agent config",
				});
			}
			return toOutput(updated);
		}),

	/** Delete a single host agent config by id. Throws NOT_FOUND if missing. */
	remove: protectedProcedure
		.input(z.object({ id: z.string().min(1) }))
		.mutation(({ ctx, input }) => {
			const existing = ctx.db
				.select({ id: hostAgentConfigs.id })
				.from(hostAgentConfigs)
				.where(eq(hostAgentConfigs.id, input.id))
				.get();
			if (!existing) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Host agent config not found: ${input.id}`,
				});
			}
			ctx.db
				.delete(hostAgentConfigs)
				.where(eq(hostAgentConfigs.id, input.id))
				.run();
			return { success: true as const };
		}),

	/**
	 * Persist a new ordering. The submitted ids must match the current
	 * configured ids exactly — no additions, no removals, no duplicates.
	 * All updates run in a single transaction so a crash mid-loop can't
	 * leave displayOrder half-updated.
	 */
	reorder: protectedProcedure
		.input(z.object({ ids: z.array(z.string().min(1)).min(1) }))
		.mutation(({ ctx, input }) => {
			const existing = listOrdered(ctx.db);
			const existingIds = new Set(existing.map((row) => row.id));
			const inputIds = new Set(input.ids);
			if (inputIds.size !== input.ids.length) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Reorder ids must be unique",
				});
			}
			if (
				existingIds.size !== inputIds.size ||
				input.ids.some((id) => !existingIds.has(id))
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Reorder ids must match existing configs exactly",
				});
			}
			const now = Date.now();
			ctx.db.transaction((tx) => {
				input.ids.forEach((id, index) => {
					tx.update(hostAgentConfigs)
						.set({ displayOrder: index, updatedAt: now })
						.where(eq(hostAgentConfigs.id, id))
						.run();
				});
			});
			return listOrdered(ctx.db).map(toOutput);
		}),

	/**
	 * Replace the current configs with the bundled defaults. Wrapped in a
	 * transaction so a crash between delete and insert can't leave the
	 * table empty.
	 */
	resetToDefaults: protectedProcedure.mutation(({ ctx }) => {
		ctx.db.transaction((tx) => {
			const existing = tx
				.select({ id: hostAgentConfigs.id })
				.from(hostAgentConfigs)
				.all();
			if (existing.length > 0) {
				tx.delete(hostAgentConfigs)
					.where(
						inArray(
							hostAgentConfigs.id,
							existing.map((row) => row.id),
						),
					)
					.run();
			}
			const seeds = getDefaultSeedPresets().map((preset, index) =>
				rowFromPreset(preset, index),
			);
			if (seeds.length > 0) {
				tx.insert(hostAgentConfigs).values(seeds).run();
			}
		});
		return listOrdered(ctx.db).map(toOutput);
	}),
});

export type HostAgentConfigDto = HostAgentConfigOutput;
