import {
	BRANCH_PREFIX_MODES,
	EXECUTION_MODES,
	FILE_OPEN_MODES,
	settings,
	TERMINAL_LINK_BEHAVIORS,
	type TerminalPreset,
} from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { app } from "electron";
import { quitWithoutConfirmation } from "main/index";
import { localDb } from "main/lib/local-db";
import {
	DEFAULT_AUTO_APPLY_DEFAULT_PRESET,
	DEFAULT_CONFIRM_ON_QUIT,
	DEFAULT_FILE_OPEN_MODE,
	DEFAULT_SHOW_PRESETS_BAR,
	DEFAULT_SHOW_RESOURCE_MONITOR,
	DEFAULT_TERMINAL_LINK_BEHAVIOR,
} from "shared/constants";
import { DEFAULT_RINGTONE_ID, RINGTONES } from "shared/ringtones";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getGitAuthorName, getGitHubUsername } from "../workspaces/utils/git";
import {
	setFontSettingsSchema,
	transformFontSettings,
} from "./font-settings.utils";

const VALID_RINGTONE_IDS = RINGTONES.map((r) => r.id);

function getSettings() {
	let row = localDb.select().from(settings).get();
	if (!row) {
		row = localDb.insert(settings).values({ id: 1 }).returning().get();
	}
	return row;
}

const DEFAULT_PRESETS: Omit<TerminalPreset, "id">[] = [
	{
		name: "claude",
		description: "Danger mode: All permissions auto-approved",
		cwd: "",
		commands: ["claude --dangerously-skip-permissions"],
	},
	{
		name: "codex",
		description: "Danger mode: All permissions auto-approved",
		cwd: "",
		commands: [
			'codex -c model_reasoning_effort="high" --ask-for-approval never --sandbox danger-full-access -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true',
		],
	},
];

function initializeDefaultPresets() {
	const row = getSettings();
	if (row.terminalPresetsInitialized) return row.terminalPresets ?? [];

	const existingPresets: TerminalPreset[] = row.terminalPresets ?? [];

	const mergedPresets =
		existingPresets.length > 0
			? existingPresets
			: DEFAULT_PRESETS.map((p) => ({
					id: crypto.randomUUID(),
					...p,
				}));

	localDb
		.insert(settings)
		.values({
			id: 1,
			terminalPresets: mergedPresets,
			terminalPresetsInitialized: true,
		})
		.onConflictDoUpdate({
			target: settings.id,
			set: {
				terminalPresets: mergedPresets,
				terminalPresetsInitialized: true,
			},
		})
		.run();

	return mergedPresets;
}

/** Get presets tagged with a given auto-apply field, falling back to the isDefault preset */
export function getPresetsForTrigger(
	field: "applyOnWorkspaceCreated" | "applyOnNewTab",
) {
	const row = getSettings();
	const presets = row.terminalPresets ?? [];
	const tagged = presets.filter((p) => p[field]);
	if (tagged.length > 0) return tagged;
	const defaultPreset = presets.find((p) => p.isDefault);
	return defaultPreset ? [defaultPreset] : [];
}

export const createSettingsRouter = () => {
	return router({
		getTerminalPresets: publicProcedure.query(() => {
			const row = getSettings();
			if (!row.terminalPresetsInitialized) {
				return initializeDefaultPresets();
			}
			return row.terminalPresets ?? [];
		}),
		createTerminalPreset: publicProcedure
			.input(
				z.object({
					name: z.string(),
					description: z.string().optional(),
					cwd: z.string(),
					commands: z.array(z.string()),
					executionMode: z.enum(EXECUTION_MODES).optional(),
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
						executionMode: z.enum(EXECUTION_MODES).optional(),
					}),
				}),
			)
			.mutation(({ input }) => {
				const row = getSettings();
				const presets = row.terminalPresets ?? [];
				const preset = presets.find((p) => p.id === input.id);

				if (!preset) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Terminal preset ${input.id} not found`,
					});
				}

				if (input.patch.name !== undefined) preset.name = input.patch.name;
				if (input.patch.description !== undefined)
					preset.description = input.patch.description;
				if (input.patch.cwd !== undefined) preset.cwd = input.patch.cwd;
				if (input.patch.commands !== undefined)
					preset.commands = input.patch.commands;
				if (input.patch.executionMode !== undefined)
					preset.executionMode = input.patch.executionMode;

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

		setDefaultPreset: publicProcedure
			.input(z.object({ id: z.string().nullable() }))
			.mutation(({ input }) => {
				const row = getSettings();
				const presets = row.terminalPresets ?? [];

				const updatedPresets = presets.map((p) => ({
					...p,
					isDefault: input.id === p.id ? true : undefined,
				}));

				localDb
					.insert(settings)
					.values({ id: 1, terminalPresets: updatedPresets })
					.onConflictDoUpdate({
						target: settings.id,
						set: { terminalPresets: updatedPresets },
					})
					.run();

				return { success: true };
			}),

		setPresetAutoApply: publicProcedure
			.input(
				z.object({
					id: z.string(),
					field: z.enum(["applyOnWorkspaceCreated", "applyOnNewTab"]),
					enabled: z.boolean(),
				}),
			)
			.mutation(({ input }) => {
				const row = getSettings();
				const presets = row.terminalPresets ?? [];

				const updatedPresets = presets.map((p) => {
					if (p.id !== input.id) return p;

					// Migrate legacy isDefault preset to explicit fields on first toggle
					const needsMigration =
						p.isDefault &&
						p.applyOnWorkspaceCreated === undefined &&
						p.applyOnNewTab === undefined;

					const base = needsMigration
						? {
								...p,
								isDefault: undefined,
								applyOnWorkspaceCreated: true as const,
								applyOnNewTab: true as const,
							}
						: p;

					return {
						...base,
						[input.field]: input.enabled ? true : undefined,
					};
				});

				localDb
					.insert(settings)
					.values({ id: 1, terminalPresets: updatedPresets })
					.onConflictDoUpdate({
						target: settings.id,
						set: { terminalPresets: updatedPresets },
					})
					.run();

				return { success: true };
			}),

		reorderTerminalPresets: publicProcedure
			.input(
				z.object({
					presetId: z.string(),
					targetIndex: z.number().int().min(0),
				}),
			)
			.mutation(({ input }) => {
				const row = getSettings();
				const presets = row.terminalPresets ?? [];

				const currentIndex = presets.findIndex((p) => p.id === input.presetId);
				if (currentIndex === -1) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Preset not found",
					});
				}

				if (input.targetIndex < 0 || input.targetIndex >= presets.length) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Invalid target index for reordering presets",
					});
				}

				const [removed] = presets.splice(currentIndex, 1);
				presets.splice(input.targetIndex, 0, removed);

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

		getDefaultPreset: publicProcedure.query(() => {
			const row = getSettings();
			const presets = row.terminalPresets ?? [];
			return presets.find((p) => p.isDefault) ?? null;
		}),

		getWorkspaceCreationPresets: publicProcedure.query(() =>
			getPresetsForTrigger("applyOnWorkspaceCreated"),
		),

		getNewTabPresets: publicProcedure.query(() =>
			getPresetsForTrigger("applyOnNewTab"),
		),

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
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Invalid ringtone ID: ${input.ringtoneId}`,
					});
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

		getShowPresetsBar: publicProcedure.query(() => {
			const row = getSettings();
			return row.showPresetsBar ?? DEFAULT_SHOW_PRESETS_BAR;
		}),

		setShowPresetsBar: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, showPresetsBar: input.enabled })
					.onConflictDoUpdate({
						target: settings.id,
						set: { showPresetsBar: input.enabled },
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

		getFileOpenMode: publicProcedure.query(() => {
			const row = getSettings();
			return row.fileOpenMode ?? DEFAULT_FILE_OPEN_MODE;
		}),

		setFileOpenMode: publicProcedure
			.input(z.object({ mode: z.enum(FILE_OPEN_MODES) }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, fileOpenMode: input.mode })
					.onConflictDoUpdate({
						target: settings.id,
						set: { fileOpenMode: input.mode },
					})
					.run();

				return { success: true };
			}),

		getAutoApplyDefaultPreset: publicProcedure.query(() => {
			const row = getSettings();
			return row.autoApplyDefaultPreset ?? DEFAULT_AUTO_APPLY_DEFAULT_PRESET;
		}),

		setAutoApplyDefaultPreset: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, autoApplyDefaultPreset: input.enabled })
					.onConflictDoUpdate({
						target: settings.id,
						set: { autoApplyDefaultPreset: input.enabled },
					})
					.run();

				return { success: true };
			}),

		restartApp: publicProcedure.mutation(() => {
			app.relaunch();
			quitWithoutConfirmation();
			return { success: true };
		}),

		getBranchPrefix: publicProcedure.query(() => {
			const row = getSettings();
			return {
				mode: row.branchPrefixMode ?? "none",
				customPrefix: row.branchPrefixCustom ?? null,
			};
		}),

		setBranchPrefix: publicProcedure
			.input(
				z.object({
					mode: z.enum(BRANCH_PREFIX_MODES),
					customPrefix: z.string().nullable().optional(),
				}),
			)
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({
						id: 1,
						branchPrefixMode: input.mode,
						branchPrefixCustom: input.customPrefix ?? null,
					})
					.onConflictDoUpdate({
						target: settings.id,
						set: {
							branchPrefixMode: input.mode,
							branchPrefixCustom: input.customPrefix ?? null,
						},
					})
					.run();

				return { success: true };
			}),

		getGitInfo: publicProcedure.query(async () => {
			const githubUsername = await getGitHubUsername();
			const authorName = await getGitAuthorName();
			return {
				githubUsername,
				authorName,
				authorPrefix: authorName?.toLowerCase().replace(/\s+/g, "-") ?? null,
			};
		}),

		getDeleteLocalBranch: publicProcedure.query(() => {
			const row = getSettings();
			return row.deleteLocalBranch ?? false;
		}),

		setDeleteLocalBranch: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, deleteLocalBranch: input.enabled })
					.onConflictDoUpdate({
						target: settings.id,
						set: { deleteLocalBranch: input.enabled },
					})
					.run();

				return { success: true };
			}),

		getNotificationSoundsMuted: publicProcedure.query(() => {
			const row = getSettings();
			return row.notificationSoundsMuted ?? false;
		}),

		setNotificationSoundsMuted: publicProcedure
			.input(z.object({ muted: z.boolean() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, notificationSoundsMuted: input.muted })
					.onConflictDoUpdate({
						target: settings.id,
						set: { notificationSoundsMuted: input.muted },
					})
					.run();

				return { success: true };
			}),

		getFontSettings: publicProcedure.query(() => {
			const row = getSettings();
			return {
				terminalFontFamily: row.terminalFontFamily ?? null,
				terminalFontSize: row.terminalFontSize ?? null,
				editorFontFamily: row.editorFontFamily ?? null,
				editorFontSize: row.editorFontSize ?? null,
			};
		}),

		setFontSettings: publicProcedure
			.input(setFontSettingsSchema)
			.mutation(({ input }) => {
				const set = transformFontSettings(input);

				if (Object.keys(set).length === 0) {
					return { success: true };
				}

				localDb
					.insert(settings)
					.values({ id: 1, ...set })
					.onConflictDoUpdate({
						target: settings.id,
						set,
					})
					.run();

				return { success: true };
			}),

		getShowResourceMonitor: publicProcedure.query(() => {
			const row = getSettings();
			return row.showResourceMonitor ?? DEFAULT_SHOW_RESOURCE_MONITOR;
		}),

		setShowResourceMonitor: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, showResourceMonitor: input.enabled })
					.onConflictDoUpdate({
						target: settings.id,
						set: { showResourceMonitor: input.enabled },
					})
					.run();

				return { success: true };
			}),

		getWorktreeBaseDir: publicProcedure.query(() => {
			const row = getSettings();
			return row.worktreeBaseDir ?? null;
		}),

		setWorktreeBaseDir: publicProcedure
			.input(z.object({ path: z.string().nullable() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, worktreeBaseDir: input.path })
					.onConflictDoUpdate({
						target: settings.id,
						set: { worktreeBaseDir: input.path },
					})
					.run();

				return { success: true };
			}),

		// TODO: remove telemetry procedures once telemetry_enabled column is dropped
		getTelemetryEnabled: publicProcedure.query(() => {
			return true;
		}),

		setTelemetryEnabled: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(() => {
				return { success: true };
			}),
	});
};
