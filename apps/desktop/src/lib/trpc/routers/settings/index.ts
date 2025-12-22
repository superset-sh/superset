import { settings, type TerminalPreset } from "@superset/local-db";
import { localDb } from "main/lib/local-db";
import { DEFAULT_RINGTONE_ID, RINGTONES } from "shared/ringtones";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const VALID_RINGTONE_IDS = RINGTONES.map((r) => r.id);

/**
 * Gets the settings row, creating one if it doesn't exist
 */
function getSettings() {
	let row = localDb.select().from(settings).get();
	if (!row) {
		row = localDb.insert(settings).values({ id: 1 }).returning().get();
	}
	return row;
}

export const createSettingsRouter = () => {
	return router({
		getLastUsedApp: publicProcedure.query(() => {
			const row = getSettings();
			return row.lastUsedApp ?? "cursor";
		}),
		getTerminalPresets: publicProcedure.query(() => {
			const row = getSettings();
			return row.terminalPresets ?? [];
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
			.mutation(({ input }) => {
				const preset: TerminalPreset = {
					id: crypto.randomUUID(),
					...input,
				};

				const row = getSettings();
				const presets = row.terminalPresets ?? [];
				presets.push(preset);

				localDb
					.insert(settings)
					.values({ id: 1, terminalPresets: presets })
					.onConflictDoUpdate({
						target: settings.id,
						set: { terminalPresets: presets },
					})
					.run();

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
			.mutation(({ input }) => {
				const row = getSettings();
				const presets = row.terminalPresets ?? [];
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

				localDb
					.insert(settings)
					.values({ id: 1, terminalPresets: presets })
					.onConflictDoUpdate({
						target: settings.id,
						set: { terminalPresets: presets },
					})
					.run();

				return { success: true };
			}),

		deleteTerminalPreset: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const row = getSettings();
				const presets = row.terminalPresets ?? [];
				const filteredPresets = presets.filter((p) => p.id !== input.id);

				localDb
					.insert(settings)
					.values({ id: 1, terminalPresets: filteredPresets })
					.onConflictDoUpdate({
						target: settings.id,
						set: { terminalPresets: filteredPresets },
					})
					.run();

				return { success: true };
			}),

		getSelectedRingtoneId: publicProcedure.query(() => {
			const row = getSettings();
			const storedId = row.selectedRingtoneId;

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
			localDb
				.insert(settings)
				.values({ id: 1, selectedRingtoneId: DEFAULT_RINGTONE_ID })
				.onConflictDoUpdate({
					target: settings.id,
					set: { selectedRingtoneId: DEFAULT_RINGTONE_ID },
				})
				.run();
			return DEFAULT_RINGTONE_ID;
		}),

		setSelectedRingtoneId: publicProcedure
			.input(z.object({ ringtoneId: z.string() }))
			.mutation(({ input }) => {
				// Validate ringtone ID exists
				if (!VALID_RINGTONE_IDS.includes(input.ringtoneId)) {
					throw new Error(`Invalid ringtone ID: ${input.ringtoneId}`);
				}

				localDb
					.insert(settings)
					.values({ id: 1, selectedRingtoneId: input.ringtoneId })
					.onConflictDoUpdate({
						target: settings.id,
						set: { selectedRingtoneId: input.ringtoneId },
					})
					.run();

				return { success: true };
			}),
	});
};
