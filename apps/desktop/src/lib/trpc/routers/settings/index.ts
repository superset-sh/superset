import {
	settings,
	TERMINAL_LINK_BEHAVIORS,
	type TerminalPreset,
} from "@superset/local-db";
import { localDb } from "main/lib/local-db";
import {
	DEFAULT_CONFIRM_ON_QUIT,
	DEFAULT_NAVIGATION_STYLE,
	DEFAULT_TERMINAL_LINK_BEHAVIOR,
} from "shared/constants";
import { DEFAULT_RINGTONE_ID, RINGTONES } from "shared/ringtones";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const VALID_RINGTONE_IDS = RINGTONES.map((r) => r.id);

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

			if (!storedId) {
				return DEFAULT_RINGTONE_ID;
			}

			if (VALID_RINGTONE_IDS.includes(storedId)) {
				return storedId;
			}

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

		getConfirmOnQuit: publicProcedure.query(() => {
			const row = getSettings();
			// Default to true (confirm on quit enabled by default)
			return row.confirmOnQuit ?? DEFAULT_CONFIRM_ON_QUIT;
		}),

		setConfirmOnQuit: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, confirmOnQuit: input.enabled })
					.onConflictDoUpdate({
						target: settings.id,
						set: { confirmOnQuit: input.enabled },
					})
					.run();

				return { success: true };
			}),

		getTerminalLinkBehavior: publicProcedure.query(() => {
			const row = getSettings();
			return row.terminalLinkBehavior ?? DEFAULT_TERMINAL_LINK_BEHAVIOR;
		}),

		setTerminalLinkBehavior: publicProcedure
			.input(z.object({ behavior: z.enum(TERMINAL_LINK_BEHAVIORS) }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, terminalLinkBehavior: input.behavior })
					.onConflictDoUpdate({
						target: settings.id,
						set: { terminalLinkBehavior: input.behavior },
					})
					.run();

				return { success: true };
			}),

		getNavigationStyle: publicProcedure.query(() => {
			const row = getSettings();
			return row.navigationStyle ?? DEFAULT_NAVIGATION_STYLE;
		}),

		setNavigationStyle: publicProcedure
			.input(z.object({ style: z.enum(["top-bar", "sidebar"]) }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, navigationStyle: input.style })
					.onConflictDoUpdate({
						target: settings.id,
						set: { navigationStyle: input.style },
					})
					.run();

				return { success: true };
			}),
	});
};
