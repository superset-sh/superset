import { db } from "main/lib/db";
import { nanoid } from "nanoid";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createSettingsRouter = () => {
	return router({
		getLastUsedApp: publicProcedure.query(() => {
			return db.data.settings.lastUsedApp ?? "cursor";
		}),

		getTerminalPresets: publicProcedure.query(() => {
			return db.data.settings.terminalPresets ?? [];
		}),

		createTerminalPreset: publicProcedure
			.input(
				z.object({
					name: z.string(),
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
	});
};
