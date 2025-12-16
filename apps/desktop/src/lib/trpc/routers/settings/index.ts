import { db } from "main/lib/db";
import type { TerminalPreset } from "main/lib/db/schemas";
import { nanoid } from "nanoid";
import { DEFAULT_RINGTONE_ID, RINGTONES } from "shared/ringtones";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/** Valid ringtone IDs for validation */
const VALID_RINGTONE_IDS = RINGTONES.map((r) => r.id);

/** Default presets to load when no presets exist */
const DEFAULT_PRESETS: Omit<TerminalPreset, "id">[] = [
	{
		name: "codex",
		description: "Danger mode: All permissions auto-approved",
		cwd: "",
		commands: [
			'codex -c model_reasoning_effort="high" --ask-for-approval never --sandbox danger-full-access -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true',
		],
	},
	{
		name: "claude",
		description: "Danger mode: All permissions auto-approved",
		cwd: "",
		commands: ["claude --dangerously-skip-permissions"],
	},
];

export const createSettingsRouter = () => {
	return router({
		getLastUsedApp: publicProcedure.query(() => {
			return db.data.settings.lastUsedApp ?? "cursor";
		}),

		getTerminalPresets: publicProcedure.query(async () => {
			const { terminalPresets, terminalPresetsInitialized } = db.data.settings;

			// Handle first-time initialization
			if (!terminalPresetsInitialized) {
				// If user already has presets (from before the flag existed), preserve them
				if (terminalPresets && terminalPresets.length > 0) {
					await db.update((data) => {
						data.settings.terminalPresetsInitialized = true;
					});
					return terminalPresets;
				}

				// No existing presets - seed with defaults
				const defaultPresetsWithIds: TerminalPreset[] = DEFAULT_PRESETS.map(
					(preset) => ({
						id: nanoid(),
						...preset,
					}),
				);

				await db.update((data) => {
					data.settings.terminalPresets = defaultPresetsWithIds;
					data.settings.terminalPresetsInitialized = true;
				});

				return defaultPresetsWithIds;
			}

			return terminalPresets ?? [];
		}),

		createTerminalPreset: publicProcedure
			.input(
				z.object({
					name: z.string(),
					description: z.string().optional(),
					cwd: z.string(),
					commands: z.array(z.string()),
				}),
			)
			.mutation(async ({ input }) => {
				const preset = {
					id: nanoid(),
					...input,
				};

				await db.update((data) => {
					if (!data.settings.terminalPresets) {
						data.settings.terminalPresets = [];
					}
					data.settings.terminalPresets.push(preset);
				});

				return preset;
			}),

		updateTerminalPreset: publicProcedure
			.input(
				z.object({
					id: z.string(),
					patch: z.object({
						name: z.string().optional(),
						description: z.string().optional(),
						cwd: z.string().optional(),
						commands: z.array(z.string()).optional(),
					}),
				}),
			)
			.mutation(async ({ input }) => {
				await db.update((data) => {
					const presets = data.settings.terminalPresets ?? [];
					const preset = presets.find((p) => p.id === input.id);

					if (!preset) {
						throw new Error(`Preset ${input.id} not found`);
					}

					if (input.patch.name !== undefined) preset.name = input.patch.name;
					if (input.patch.description !== undefined)
						preset.description = input.patch.description;
					if (input.patch.cwd !== undefined) preset.cwd = input.patch.cwd;
					if (input.patch.commands !== undefined)
						preset.commands = input.patch.commands;
				});

				return { success: true };
			}),

		deleteTerminalPreset: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				await db.update((data) => {
					const presets = data.settings.terminalPresets ?? [];
					data.settings.terminalPresets = presets.filter(
						(p) => p.id !== input.id,
					);
				});

				return { success: true };
			}),

		getSelectedRingtoneId: publicProcedure.query(async () => {
			const storedId = db.data.settings.selectedRingtoneId;

			// If no stored ID, return default
			if (!storedId) {
				return DEFAULT_RINGTONE_ID;
			}

			// If stored ID is valid, return it
			if (VALID_RINGTONE_IDS.includes(storedId)) {
				return storedId;
			}

			// Stored ID is invalid/stale - self-heal by persisting the default
			console.warn(
				`[settings] Invalid ringtone ID "${storedId}" found, resetting to default`,
			);
			await db.update((data) => {
				data.settings.selectedRingtoneId = DEFAULT_RINGTONE_ID;
			});
			return DEFAULT_RINGTONE_ID;
		}),

		setSelectedRingtoneId: publicProcedure
			.input(z.object({ ringtoneId: z.string() }))
			.mutation(async ({ input }) => {
				// Validate ringtone ID exists
				if (!VALID_RINGTONE_IDS.includes(input.ringtoneId)) {
					throw new Error(`Invalid ringtone ID: ${input.ringtoneId}`);
				}

				await db.update((data) => {
					data.settings.selectedRingtoneId = input.ringtoneId;
				});

				return { success: true };
			}),
	});
};
