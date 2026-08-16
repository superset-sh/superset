import { randomUUID } from "node:crypto";
import type { PromptTransport } from "@superset/shared/agent-prompt-launch";
import {
	getDefaultSeedPresets,
	getPresetById,
	type HostAgentPreset,
} from "@superset/shared/host-agent-presets";
import { TRPCError } from "@trpc/server";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { RevisionedAgentCapabilityConfig } from "../../../agent-capabilities/capability-refresh-service";
import type { HostDb } from "../../../db";
import {
	hostAgentCapabilitySnapshots,
	hostAgentConfigs,
} from "../../../db/schema";
import { protectedProcedure, router } from "../../index";
import {
	agentArgvSchema,
	agentEnvSchema,
	parseAgentArgv,
	parseAgentEnv,
	parsePromptTransport,
	promptTransportSchema,
} from "./agent-config-parsers";

export interface HostAgentConfig {
	id: string;
	presetId: string;
	/** Built-in icon key to render, or null to fall back to `presetId`. */
	iconId: string | null;
	label: string;
	command: string;
	args: string[];
	promptTransport: PromptTransport;
	promptArgs: string[];
	/** Args that resume a previous session; the session id is appended after
	 * them. Empty when the agent has no id-based resume. */
	resumeArgs: string[];
	env: Record<string, string>;
	order: number;
}

interface HostAgentConfigRow {
	id: string;
	presetId: string;
	iconId: string | null;
	label: string;
	command: string;
	argsJson: string;
	promptTransport: string;
	promptArgsJson: string;
	resumeArgsJson: string;
	envJson: string;
	capabilityRevision: number;
	displayOrder: number;
}

function toOutput(row: HostAgentConfigRow): HostAgentConfig {
	return {
		id: row.id,
		presetId: row.presetId,
		iconId: row.iconId ?? null,
		label: row.label,
		command: row.command,
		args: parseAgentArgv(row.argsJson),
		promptTransport: parsePromptTransport(row.promptTransport),
		promptArgs: parseAgentArgv(row.promptArgsJson),
		resumeArgs: parseAgentArgv(row.resumeArgsJson),
		env: parseAgentEnv(row.envJson),
		order: row.displayOrder,
	};
}

function rowFromPreset(
	preset: HostAgentPreset,
	displayOrder: number,
): typeof hostAgentConfigs.$inferInsert {
	return {
		id: randomUUID(),
		presetId: preset.presetId,
		iconId: null,
		label: preset.label,
		command: preset.command,
		argsJson: JSON.stringify(preset.args),
		promptTransport: preset.promptTransport,
		promptArgsJson: JSON.stringify(preset.promptArgs),
		resumeArgsJson: JSON.stringify(preset.resumeArgs),
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

function toCapabilityConfig(
	row: HostAgentConfigRow,
): RevisionedAgentCapabilityConfig {
	return {
		id: row.id,
		presetId: row.presetId,
		command: row.command,
		args: parseAgentArgv(row.argsJson),
		env: parseAgentEnv(row.envJson),
		configRevision: row.capabilityRevision,
	};
}

function argsEqual(leftJson: string, right: string[]): boolean {
	const left = parseAgentArgv(leftJson);
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

function envsEqual(leftJson: string, right: Record<string, string>): boolean {
	const left = Object.entries(parseAgentEnv(leftJson)).sort(([a], [b]) =>
		a.localeCompare(b),
	);
	const normalizedRight = Object.entries(right).sort(([a], [b]) =>
		a.localeCompare(b),
	);
	return JSON.stringify(left) === JSON.stringify(normalizedRight);
}

// An icon override is either a built-in icon key ("claude") or an uploaded
// `data:` image URI. Capped so an oversized upload can't bloat the per-machine
// SQLite DB — the client downscales images before sending.
const MAX_ICON_ID_LENGTH = 256 * 1024;
const iconIdSchema = z.string().trim().min(1).max(MAX_ICON_ID_LENGTH);
// `null` clears the icon override (fall back to `presetId`); a string sets it.
const iconIdPatchSchema = iconIdSchema.nullable();

const updatePatchSchema = z
	.object({
		label: z.string().trim().min(1).optional(),
		command: z.string().trim().min(1).optional(),
		args: agentArgvSchema.optional(),
		promptTransport: promptTransportSchema.optional(),
		promptArgs: agentArgvSchema.optional(),
		resumeArgs: agentArgvSchema.optional(),
		env: agentEnvSchema.optional(),
		iconId: iconIdPatchSchema.optional(),
	})
	.refine(
		(patch) =>
			patch.label !== undefined ||
			patch.command !== undefined ||
			patch.args !== undefined ||
			patch.promptTransport !== undefined ||
			patch.promptArgs !== undefined ||
			patch.resumeArgs !== undefined ||
			patch.env !== undefined ||
			patch.iconId !== undefined,
		{ message: "Patch must update at least one field" },
	);

const addInputSchema = z.object({
	label: z.string().trim().min(1),
	command: z.string().trim().min(1),
	args: agentArgvSchema,
	promptTransport: promptTransportSchema,
	promptArgs: agentArgvSchema,
	// Defaulted so an older desktop client that doesn't send it can still add.
	resumeArgs: agentArgvSchema.default([]),
	env: agentEnvSchema,
	presetId: z.string().trim().min(1).optional(),
	iconId: iconIdSchema.optional(),
});

export const agentConfigsRouter = router({
	/**
	 * List configured host agents in persisted order. Seeds bundled defaults
	 * on first call when no configs exist.
	 */
	list: protectedProcedure.query(({ ctx }) => {
		const rows = seedDefaultsIfEmpty(ctx.db);
		return rows.map(toOutput);
	}),

	/** Read persisted capability snapshots without spawning an agent process. */
	listCapabilitySnapshots: protectedProcedure.query(({ ctx }) => {
		seedDefaultsIfEmpty(ctx.db);
		return ctx.capabilityRefresh.readPersisted();
	}),

	/** Explicitly refresh all or the requested agents. Concurrent probes coalesce. */
	refreshCapabilities: protectedProcedure
		.input(
			z
				.object({
					agentIds: z.array(z.string().min(1)).optional(),
				})
				.optional(),
		)
		.mutation(async ({ ctx, input }) => {
			const requestedIds = input?.agentIds ? new Set(input.agentIds) : null;
			const configs = seedDefaultsIfEmpty(ctx.db)
				.filter((row) => requestedIds === null || requestedIds.has(row.id))
				.map(toCapabilityConfig);
			return ctx.capabilityRefresh.refreshCapabilities(configs);
		}),

	/**
	 * Insert a configured host-agent row. Callers pass the full launch shape;
	 * `presetId` is a free-form metadata tag the client uses for description
	 * lookup (and as the icon fallback), defaulting to `"custom"` when omitted.
	 * `iconId` optionally overrides the rendered icon with a built-in icon key
	 * (used by user-authored agents, whose `presetId` is `"custom"`). Duplicate
	 * `presetId` values are allowed — each row gets a fresh `id`.
	 */
	add: protectedProcedure
		.input(addInputSchema)
		.mutation(async ({ ctx, input }) => {
			const existing = listOrdered(ctx.db);
			const nextOrder =
				existing.length === 0
					? 0
					: Math.max(...existing.map((row) => row.displayOrder)) + 1;
			const id = randomUUID();
			ctx.db
				.insert(hostAgentConfigs)
				.values({
					id,
					presetId: input.presetId ?? "custom",
					iconId: input.iconId ?? null,
					label: input.label,
					command: input.command,
					argsJson: JSON.stringify(input.args),
					promptTransport: input.promptTransport,
					promptArgsJson: JSON.stringify(input.promptArgs),
					resumeArgsJson: JSON.stringify(input.resumeArgs),
					envJson: JSON.stringify(input.env),
					displayOrder: nextOrder,
				})
				.run();
			const created = ctx.db
				.select()
				.from(hostAgentConfigs)
				.where(eq(hostAgentConfigs.id, id))
				.get();
			if (!created) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to read back inserted host agent config",
				});
			}
			await ctx.capabilityRefresh
				.refreshCapability(toCapabilityConfig(created))
				.catch(() => console.warn("[agent-capabilities] add refresh failed"));
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
		.mutation(async ({ ctx, input }) => {
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
			const discoveryIdentityChanged =
				(input.patch.command !== undefined &&
					input.patch.command !== existing.command) ||
				(input.patch.args !== undefined &&
					!argsEqual(existing.argsJson, input.patch.args)) ||
				(input.patch.env !== undefined &&
					!envsEqual(existing.envJson, input.patch.env));
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
			if (input.patch.resumeArgs !== undefined)
				update.resumeArgsJson = JSON.stringify(input.patch.resumeArgs);
			if (input.patch.env !== undefined)
				update.envJson = JSON.stringify(input.patch.env);
			if (input.patch.iconId !== undefined) update.iconId = input.patch.iconId;
			ctx.db.transaction((tx) => {
				tx.update(hostAgentConfigs)
					.set(
						discoveryIdentityChanged
							? {
									...update,
									capabilityRevision: sql`${hostAgentConfigs.capabilityRevision} + 1`,
								}
							: update,
					)
					.where(eq(hostAgentConfigs.id, input.id))
					.run();
				if (discoveryIdentityChanged) {
					tx.delete(hostAgentCapabilitySnapshots)
						.where(eq(hostAgentCapabilitySnapshots.agentId, input.id))
						.run();
				}
			});
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
			if (discoveryIdentityChanged) {
				await ctx.capabilityRefresh
					.refreshCapability(toCapabilityConfig(updated))
					.catch(() =>
						console.warn("[agent-capabilities] config refresh failed"),
					);
			}
			return toOutput(updated);
		}),

	/**
	 * Restore one configured built-in agent to the bundled definition while
	 * preserving its stable id and display order. This repairs stale defaults
	 * without replacing unrelated custom agents or breaking linked presets.
	 */
	restoreDefault: protectedProcedure
		.input(z.object({ id: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
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

			const preset = getPresetById(existing.presetId);
			if (!preset) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Agent config '${input.id}' has no bundled default`,
				});
			}

			ctx.db.transaction((tx) => {
				tx.update(hostAgentConfigs)
					.set({
						iconId: null,
						label: preset.label,
						command: preset.command,
						argsJson: JSON.stringify(preset.args),
						promptTransport: preset.promptTransport,
						promptArgsJson: JSON.stringify(preset.promptArgs),
						resumeArgsJson: JSON.stringify(preset.resumeArgs),
						envJson: JSON.stringify(preset.env),
						capabilityRevision: sql`${hostAgentConfigs.capabilityRevision} + 1`,
						updatedAt: Date.now(),
					})
					.where(eq(hostAgentConfigs.id, input.id))
					.run();
				tx.delete(hostAgentCapabilitySnapshots)
					.where(eq(hostAgentCapabilitySnapshots.agentId, input.id))
					.run();
			});

			const restored = ctx.db
				.select()
				.from(hostAgentConfigs)
				.where(eq(hostAgentConfigs.id, input.id))
				.get();
			if (!restored) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to read back restored host agent config",
				});
			}
			await ctx.capabilityRefresh
				.refreshCapability(toCapabilityConfig(restored))
				.catch(() =>
					console.warn("[agent-capabilities] restore refresh failed"),
				);
			return toOutput(restored);
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
	resetToDefaults: protectedProcedure.mutation(async ({ ctx }) => {
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
		const rows = listOrdered(ctx.db);
		await ctx.capabilityRefresh
			.refreshCapabilities(rows.map(toCapabilityConfig))
			.catch(() => console.warn("[agent-capabilities] reset refresh failed"));
		return rows.map(toOutput);
	}),
});
