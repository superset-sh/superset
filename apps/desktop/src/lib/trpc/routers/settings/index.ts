import { readFile, writeFile } from "node:fs/promises";
import {
	BRANCH_PREFIX_MODES,
	EXECUTION_MODES,
	EXTERNAL_APPS,
	FILE_OPEN_MODES,
	NON_EDITOR_APPS,
	projects,
	settings,
	TERMINAL_LINK_BEHAVIORS,
	type TerminalPreset,
	workspaces,
} from "@superset/local-db";
import {
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
} from "@superset/shared/agent-command";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import {
	app,
	BrowserWindow,
	dialog,
	type OpenDialogOptions,
	type SaveDialogOptions,
} from "electron";
import { quitWithoutConfirmation } from "main/index";
import { hasCustomRingtone } from "main/lib/custom-ringtones";
import { localDb } from "main/lib/local-db";
import {
	DEFAULT_AUTO_APPLY_DEFAULT_PRESET,
	DEFAULT_CONFIRM_ON_QUIT,
	DEFAULT_FILE_OPEN_MODE,
	DEFAULT_OPEN_LINKS_IN_APP,
	DEFAULT_SHOW_PRESETS_BAR,
	DEFAULT_SHOW_RESOURCE_MONITOR,
	DEFAULT_TERMINAL_LINK_BEHAVIOR,
	DEFAULT_USE_COMPACT_TERMINAL_ADD_BUTTON,
} from "shared/constants";
import {
	CUSTOM_RINGTONE_ID,
	DEFAULT_RINGTONE_ID,
	isBuiltInRingtoneId,
} from "shared/ringtones";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getGitAuthorName, getGitHubUsername } from "../workspaces/utils/git";
import {
	setFontSettingsSchema,
	transformFontSettings,
} from "./font-settings.utils";
import {
	normalizeTerminalPresets,
	type PresetWithUnknownMode,
} from "./preset-execution-mode";
import {
	createTerminalPresetsExport,
	isSharedPresetId,
	loadSharedTerminalPresets,
	mergeSharedAndLocalTerminalPresets,
	parseImportedTerminalPresets,
	toLocalTerminalPresets,
} from "./shared-presets";

function isValidRingtoneId(ringtoneId: string): boolean {
	if (isBuiltInRingtoneId(ringtoneId)) {
		return true;
	}

	if (ringtoneId === CUSTOM_RINGTONE_ID) {
		return hasCustomRingtone();
	}

	return false;
}

function getSettings() {
	let row = localDb.select().from(settings).get();
	if (!row) {
		row = localDb.insert(settings).values({ id: 1 }).returning().get();
	}
	return row;
}

function readRawTerminalPresets(): PresetWithUnknownMode[] {
	const row = getSettings();
	return (row.terminalPresets ?? []) as PresetWithUnknownMode[];
}

function getNormalizedTerminalPresets() {
	const rawPresets = readRawTerminalPresets();
	return normalizeTerminalPresets(rawPresets);
}

function getActiveProjectMainRepoPath(): string | null {
	const row = getSettings();
	const activeWorkspaceId = row.lastActiveWorkspaceId;
	if (!activeWorkspaceId) {
		const mostRecentProject = localDb
			.select({ mainRepoPath: projects.mainRepoPath })
			.from(projects)
			.orderBy(desc(projects.lastOpenedAt))
			.limit(1)
			.get();
		return mostRecentProject?.mainRepoPath ?? null;
	}

	const workspace = localDb
		.select({ projectId: workspaces.projectId })
		.from(workspaces)
		.where(eq(workspaces.id, activeWorkspaceId))
		.get();

	if (!workspace) {
		const mostRecentProject = localDb
			.select({ mainRepoPath: projects.mainRepoPath })
			.from(projects)
			.orderBy(desc(projects.lastOpenedAt))
			.limit(1)
			.get();
		return mostRecentProject?.mainRepoPath ?? null;
	}

	const project = localDb
		.select({ mainRepoPath: projects.mainRepoPath })
		.from(projects)
		.where(eq(projects.id, workspace.projectId))
		.get();

	return project?.mainRepoPath ?? null;
}

function getSharedTerminalPresets() {
	const mainRepoPath = getActiveProjectMainRepoPath();
	if (!mainRepoPath) {
		return [];
	}
	return loadSharedTerminalPresets(mainRepoPath);
}

function getEffectiveTerminalPresets() {
	const localPresets = getNormalizedTerminalPresets();
	const sharedPresets = getSharedTerminalPresets();
	return mergeSharedAndLocalTerminalPresets(sharedPresets, localPresets);
}

function saveTerminalPresets(
	presets: TerminalPreset[],
	options?: { terminalPresetsInitialized?: boolean },
) {
	const values = { id: 1, terminalPresets: presets, ...options };
	localDb
		.insert(settings)
		.values(values)
		.onConflictDoUpdate({
			target: settings.id,
			set: { terminalPresets: presets, ...options },
		})
		.run();
}

const DEFAULT_PRESET_AGENTS = [
	"claude",
	"codex",
	"copilot",
	"opencode",
	"gemini",
] as const;

const DEFAULT_PRESETS: Omit<TerminalPreset, "id">[] = DEFAULT_PRESET_AGENTS.map(
	(name) => ({
		name,
		description: AGENT_PRESET_DESCRIPTIONS[name],
		cwd: "",
		commands: AGENT_PRESET_COMMANDS[name],
	}),
);

function initializeDefaultPresets() {
	const row = getSettings();
	if (row.terminalPresetsInitialized) return row.terminalPresets ?? [];

	const existingPresets = getNormalizedTerminalPresets();

	const mergedPresets =
		existingPresets.length > 0
			? existingPresets
			: DEFAULT_PRESETS.map((p) => ({
					id: crypto.randomUUID(),
					...p,
					executionMode: p.executionMode ?? "new-tab",
				}));

	saveTerminalPresets(mergedPresets, { terminalPresetsInitialized: true });

	return mergedPresets;
}

/** Get presets tagged with a given auto-apply field, falling back to the isDefault preset */
export function getPresetsForTrigger(
	field: "applyOnWorkspaceCreated" | "applyOnNewTab",
) {
	const presets = getEffectiveTerminalPresets();
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
				const sharedPresets = getSharedTerminalPresets();
				const existingLocalPresets = getNormalizedTerminalPresets();
				if (existingLocalPresets.length === 0 && sharedPresets.length === 0) {
					return initializeDefaultPresets();
				}
				saveTerminalPresets(existingLocalPresets, {
					terminalPresetsInitialized: true,
				});
			}
			return getEffectiveTerminalPresets();
		}),
		exportTerminalPresets: publicProcedure.mutation(async () => {
			const window = BrowserWindow.getFocusedWindow();
			const saveDialogOptions: SaveDialogOptions = {
				title: "Export Terminal Presets",
				defaultPath: "superset-presets.json",
				filters: [{ name: "JSON", extensions: ["json"] }],
			};
			const result = window
				? await dialog.showSaveDialog(window, saveDialogOptions)
				: await dialog.showSaveDialog(saveDialogOptions);

			if (result.canceled || !result.filePath) {
				return { canceled: true as const };
			}

			const exportFile = createTerminalPresetsExport(
				getEffectiveTerminalPresets(),
			);
			try {
				await writeFile(
					result.filePath,
					JSON.stringify(exportFile, null, 2),
					"utf-8",
				);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to write file";
				return { canceled: false as const, error: message };
			}

			return {
				canceled: false as const,
				path: result.filePath,
				exportedCount: exportFile.presets.length,
			};
		}),
		importTerminalPresets: publicProcedure.mutation(async () => {
			const window = BrowserWindow.getFocusedWindow();
			const openDialogOptions: OpenDialogOptions = {
				title: "Import Terminal Presets",
				properties: ["openFile"],
				filters: [{ name: "JSON", extensions: ["json"] }],
			};
			const result = window
				? await dialog.showOpenDialog(window, openDialogOptions)
				: await dialog.showOpenDialog(openDialogOptions);

			if (result.canceled || result.filePaths.length === 0) {
				return { canceled: true as const };
			}

			const filePath = result.filePaths[0];
			try {
				const content = await readFile(filePath, "utf-8");
				const importedPresets = parseImportedTerminalPresets(
					JSON.parse(content),
				);

				if (importedPresets.length === 0) {
					return {
						canceled: false as const,
						error: "No presets found in the selected file",
					};
				}

				const localPresets = getNormalizedTerminalPresets();
				const importedWithIds: TerminalPreset[] = importedPresets.map(
					(preset) => ({
						id: crypto.randomUUID(),
						...preset,
					}),
				);
				saveTerminalPresets([...localPresets, ...importedWithIds], {
					terminalPresetsInitialized: true,
				});

				return {
					canceled: false as const,
					path: filePath,
					importedCount: importedWithIds.length,
				};
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Invalid presets file";
				return { canceled: false as const, error: message };
			}
		}),
		createTerminalPreset: publicProcedure
			.input(
				z.object({
					name: z.string(),
					description: z.string().optional(),
					cwd: z.string(),
					commands: z.array(z.string()),
					pinnedToBar: z.boolean().optional(),
					executionMode: z.enum(EXECUTION_MODES).optional(),
				}),
			)
			.mutation(({ input }) => {
				const preset: TerminalPreset = {
					id: crypto.randomUUID(),
					...input,
					executionMode: input.executionMode ?? "new-tab",
				};

				const presets = getNormalizedTerminalPresets();
				presets.push(preset);

				saveTerminalPresets(presets);

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
						pinnedToBar: z.boolean().optional(),
						executionMode: z.enum(EXECUTION_MODES).optional(),
					}),
				}),
			)
			.mutation(({ input }) => {
				const localPresets = getNormalizedTerminalPresets();
				const sharedPresets = getSharedTerminalPresets();
				let preset = localPresets.find((p) => p.id === input.id);

				if (!preset) {
					const sharedPreset = sharedPresets.find((p) => p.id === input.id);
					if (!sharedPreset) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: `Terminal preset ${input.id} not found`,
						});
					}
					// Shared presets from .superset/presets.json are edited by creating
					// a local override with the same id.
					preset = { ...sharedPreset };
					localPresets.push(preset);
				}

				if (input.patch.name !== undefined) preset.name = input.patch.name;
				if (input.patch.description !== undefined)
					preset.description = input.patch.description;
				if (input.patch.cwd !== undefined) preset.cwd = input.patch.cwd;
				if (input.patch.commands !== undefined)
					preset.commands = input.patch.commands;
				if (input.patch.pinnedToBar !== undefined)
					preset.pinnedToBar = input.patch.pinnedToBar;
				if (input.patch.executionMode !== undefined)
					preset.executionMode = input.patch.executionMode;

				saveTerminalPresets(localPresets);

				return { success: true };
			}),

		deleteTerminalPreset: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const localPresets = getNormalizedTerminalPresets();
				const hasLocalPreset = localPresets.some((p) => p.id === input.id);
				const filteredPresets = localPresets.filter((p) => p.id !== input.id);

				if (!hasLocalPreset && isSharedPresetId(input.id)) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Shared presets cannot be deleted in app. Remove them from .superset/presets.json.",
					});
				}

				saveTerminalPresets(filteredPresets);

				return { success: true };
			}),

		setDefaultPreset: publicProcedure
			.input(z.object({ id: z.string().nullable() }))
			.mutation(({ input }) => {
				const sharedPresets = getSharedTerminalPresets();
				const presets = getEffectiveTerminalPresets();
				if (input.id && !presets.some((preset) => preset.id === input.id)) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Terminal preset ${input.id} not found`,
					});
				}

				const updatedPresets = presets.map((p) => ({
					...p,
					isDefault: input.id === p.id ? true : undefined,
				}));

				saveTerminalPresets(
					toLocalTerminalPresets(updatedPresets, sharedPresets),
				);

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
				const sharedPresets = getSharedTerminalPresets();
				const presets = getEffectiveTerminalPresets();
				if (!presets.some((preset) => preset.id === input.id)) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Terminal preset ${input.id} not found`,
					});
				}

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

				saveTerminalPresets(
					toLocalTerminalPresets(updatedPresets, sharedPresets),
				);

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
				const sharedPresets = getSharedTerminalPresets();
				const presets = getEffectiveTerminalPresets();
				const sharedPresetIds = new Set(
					sharedPresets.map((preset) => preset.id),
				);

				if (sharedPresetIds.has(input.presetId)) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Shared presets cannot be reordered in app. Reorder them in .superset/presets.json.",
					});
				}

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

				if (input.targetIndex < sharedPresets.length) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Local presets cannot be moved before shared presets from .superset/presets.json.",
					});
				}

				const [removed] = presets.splice(currentIndex, 1);
				presets.splice(input.targetIndex, 0, removed);

				saveTerminalPresets(toLocalTerminalPresets(presets, sharedPresets));

				return { success: true };
			}),

		getDefaultPreset: publicProcedure.query(() => {
			const presets = getEffectiveTerminalPresets();
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

			if (isValidRingtoneId(storedId)) {
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
				if (!isValidRingtoneId(input.ringtoneId)) {
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

		getUseCompactTerminalAddButton: publicProcedure.query(() => {
			const row = getSettings();
			return (
				row.useCompactTerminalAddButton ??
				DEFAULT_USE_COMPACT_TERMINAL_ADD_BUTTON
			);
		}),

		setUseCompactTerminalAddButton: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, useCompactTerminalAddButton: input.enabled })
					.onConflictDoUpdate({
						target: settings.id,
						set: { useCompactTerminalAddButton: input.enabled },
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

		getOpenLinksInApp: publicProcedure.query(() => {
			const row = getSettings();
			return row.openLinksInApp ?? DEFAULT_OPEN_LINKS_IN_APP;
		}),

		setOpenLinksInApp: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, openLinksInApp: input.enabled })
					.onConflictDoUpdate({
						target: settings.id,
						set: { openLinksInApp: input.enabled },
					})
					.run();

				return { success: true };
			}),

		getDefaultEditor: publicProcedure.query(() => {
			const row = getSettings();
			return row.defaultEditor ?? null;
		}),

		setDefaultEditor: publicProcedure
			.input(
				z.object({
					editor: z
						.enum(EXTERNAL_APPS)
						.nullable()
						.refine((val) => val === null || !NON_EDITOR_APPS.includes(val), {
							message: "Non-editor apps cannot be set as the global default",
						}),
				}),
			)
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, defaultEditor: input.editor })
					.onConflictDoUpdate({
						target: settings.id,
						set: { defaultEditor: input.editor },
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
