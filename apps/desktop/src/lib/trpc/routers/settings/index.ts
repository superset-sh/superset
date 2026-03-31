import {
	type AgentCustomDefinition,
	type AgentPresetOverrideEnvelope,
	BRANCH_PREFIX_MODES,
	EXECUTION_MODES,
	EXTERNAL_APPS,
	FILE_OPEN_MODES,
	NON_EDITOR_APPS,
	settings,
	TERMINAL_LINK_BEHAVIORS,
	type TerminalPreset,
} from "@superset/local-db";
import {
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
} from "@superset/shared/agent-command";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { app } from "electron";
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
import { normalizePresetProjectIds } from "shared/preset-project-targeting";
import {
	CUSTOM_RINGTONE_ID,
	DEFAULT_RINGTONE_ID,
	isBuiltInRingtoneId,
} from "shared/ringtones";
import {
	type AgentDefinitionId,
	createOverrideEnvelopeWithPatch,
	getAgentDefinitionById,
	readAgentPresetOverrides,
	resetAgentPresetOverride,
	resolveAgentConfigs,
} from "shared/utils/agent-settings";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getGitAuthorName, getGitHubUsername } from "../workspaces/utils/git";
import {
	normalizeAgentPresetPatch,
	updateAgentPresetInputSchema,
} from "./agent-preset-router.utils";
import {
	setFontSettingsSchema,
	transformFontSettings,
} from "./font-settings.utils";
import {
	normalizeTerminalPresets,
	type PresetWithUnknownMode,
	shouldPersistNormalizedTerminalPresets,
} from "./preset-execution-mode";
import { getPresetsForTriggerField } from "./preset-trigger-selection";

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
	const normalizedPresets = normalizeTerminalPresets(rawPresets);

	if (shouldPersistNormalizedTerminalPresets(rawPresets)) {
		saveTerminalPresets(normalizedPresets);
	}

	return normalizedPresets;
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

function readRawAgentPresetOverrides(): AgentPresetOverrideEnvelope {
	const row = getSettings();
	return readAgentPresetOverrides(row.agentPresetOverrides);
}

function readRawAgentCustomDefinitions(): AgentCustomDefinition[] {
	const row = getSettings();
	return row.agentCustomDefinitions ?? [];
}

function saveAgentPresetOverrides(overrides: AgentPresetOverrideEnvelope) {
	localDb
		.insert(settings)
		.values({
			id: 1,
			agentPresetOverrides: overrides,
		})
		.onConflictDoUpdate({
			target: settings.id,
			set: { agentPresetOverrides: overrides },
		})
		.run();
}

function getResolvedAgentPresets() {
	return resolveAgentConfigs({
		customDefinitions: readRawAgentCustomDefinitions(),
		overrideEnvelope: readRawAgentPresetOverrides(),
	});
}

const DEFAULT_PRESET_AGENTS = [
	"claude",
	"codex",
	"copilot",
	"opencode",
	"pi",
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

/** Get presets tagged with a given auto-apply field for the current project, falling back to all-project presets. */
export function getPresetsForTrigger(
	field: "applyOnWorkspaceCreated" | "applyOnNewTab",
	projectId?: string | null,
) {
	return getPresetsForTriggerField(
		getNormalizedTerminalPresets(),
		field,
		projectId,
	);
}

export const createSettingsRouter = () => {
	return router({
		getTerminalPresets: publicProcedure.query(() => {
			const row = getSettings();
			if (!row.terminalPresetsInitialized) {
				return initializeDefaultPresets();
			}
			return getNormalizedTerminalPresets();
		}),
		getAgentPresets: publicProcedure.query(() => getResolvedAgentPresets()),
		updateAgentPreset: publicProcedure
			.input(updateAgentPresetInputSchema)
			.mutation(({ input }) => {
				const definition = getAgentDefinitionById({
					customDefinitions: readRawAgentCustomDefinitions(),
					id: input.id as AgentDefinitionId,
				});
				if (!definition) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Agent preset ${input.id} not found`,
					});
				}

				const normalizedPatch = normalizeAgentPresetPatch({
					definition,
					patch: input.patch,
				});
				const nextOverrides = createOverrideEnvelopeWithPatch({
					definition,
					currentOverrides: readRawAgentPresetOverrides(),
					id: input.id as AgentDefinitionId,
					patch: normalizedPatch,
				});

				saveAgentPresetOverrides(nextOverrides);

				return getResolvedAgentPresets().find(
					(preset) => preset.id === input.id,
				);
			}),
		resetAgentPreset: publicProcedure
			.input(z.object({ id: z.string().min(1) }))
			.mutation(({ input }) => {
				const nextOverrides = resetAgentPresetOverride({
					currentOverrides: readRawAgentPresetOverrides(),
					id: input.id as AgentDefinitionId,
				});
				saveAgentPresetOverrides(nextOverrides);
				return { success: true };
			}),
		resetAllAgentPresets: publicProcedure.mutation(() => {
			saveAgentPresetOverrides({ version: 1, presets: [] });
			return { success: true };
		}),
		createTerminalPreset: publicProcedure
			.input(
				z.object({
					name: z.string(),
					description: z.string().optional(),
					cwd: z.string(),
					commands: z.array(z.string()),
					projectIds: z.array(z.string()).nullable().optional(),
					pinnedToBar: z.boolean().optional(),
					executionMode: z.enum(EXECUTION_MODES).optional(),
				}),
			)
			.mutation(({ input }) => {
				const preset: TerminalPreset = {
					id: crypto.randomUUID(),
					...input,
					projectIds: normalizePresetProjectIds(input.projectIds),
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
						projectIds: z.array(z.string()).nullable().optional(),
						pinnedToBar: z.boolean().optional(),
						executionMode: z.enum(EXECUTION_MODES).optional(),
					}),
				}),
			)
			.mutation(({ input }) => {
				const presets = getNormalizedTerminalPresets();
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
				if (input.patch.projectIds !== undefined)
					preset.projectIds = normalizePresetProjectIds(input.patch.projectIds);
				if (input.patch.pinnedToBar !== undefined)
					preset.pinnedToBar = input.patch.pinnedToBar;
				if (input.patch.executionMode !== undefined)
					preset.executionMode = input.patch.executionMode;

				saveTerminalPresets(presets);

				return { success: true };
			}),

		deleteTerminalPreset: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const presets = getNormalizedTerminalPresets();
				const filteredPresets = presets.filter((p) => p.id !== input.id);

				saveTerminalPresets(filteredPresets);

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
				const presets = getNormalizedTerminalPresets();

				const updatedPresets = presets.map((p) => {
					if (p.id !== input.id) return p;

					return {
						...p,
						[input.field]: input.enabled ? true : undefined,
					};
				});

				saveTerminalPresets(updatedPresets);

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
				const presets = getNormalizedTerminalPresets();

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

				saveTerminalPresets(presets);

				return { success: true };
			}),

		getWorkspaceCreationPresets: publicProcedure
			.input(
				z
					.object({
						projectId: z.string().nullable().optional(),
					})
					.optional(),
			)
			.query(({ input }) =>
				getPresetsForTrigger(
					"applyOnWorkspaceCreated",
					input?.projectId ?? null,
				),
			),

		getNewTabPresets: publicProcedure
			.input(
				z
					.object({
						projectId: z.string().nullable().optional(),
					})
					.optional(),
			)
			.query(({ input }) =>
				getPresetsForTrigger("applyOnNewTab", input?.projectId ?? null),
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

		getOnedevConfig: publicProcedure.query(() => {
			const row = getSettings();
			return {
				url: row.onedevUrl ?? null,
				accessToken: row.onedevAccessToken ?? null,
			};
		}),

		setOnedevConfig: publicProcedure
			.input(
				z.object({
					url: z.string().nullable(),
					accessToken: z.string().nullable(),
				}),
			)
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({
						id: 1,
						onedevUrl: input.url,
						onedevAccessToken: input.accessToken,
					})
					.onConflictDoUpdate({
						target: settings.id,
						set: {
							onedevUrl: input.url,
							onedevAccessToken: input.accessToken,
						},
					})
					.run();

				return { success: true };
			}),

		testOnedevConnection: publicProcedure
			.input(
				z.object({
					url: z.string(),
					accessToken: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				try {
					const baseUrl = input.url.replace(/\/+$/, "");
					const response = await fetch(
						`${baseUrl}/~api/projects?offset=0&count=1`,
						{
							headers: {
								Authorization: `Bearer ${input.accessToken}`,
							},
						},
					);
					return { success: response.ok };
				} catch {
					return { success: false };
				}
			}),

		getAllOnedevProjects: publicProcedure.query(async () => {
			const row = getSettings();
			const url = row.onedevUrl;
			const accessToken = row.onedevAccessToken;
			if (!url || !accessToken) {
				return [];
			}
			try {
				const { createOnedevClient } = await import(
					"../changes/utils/onedev-api"
				);
				const client = createOnedevClient({ url, accessToken });
				return await client.getAllProjects();
			} catch {
				return [];
			}
		}),

		getOnedevIssues: publicProcedure
			.input(
				z.object({
					projectPath: z.string(),
					stateFilter: z.string().optional(),
					offset: z.number().optional(),
					count: z.number().optional(),
				}),
			)
			.query(async ({ input }) => {
				const row = getSettings();
				const url = row.onedevUrl;
				const accessToken = row.onedevAccessToken;
				if (!url || !accessToken) {
					return { issues: [], projectKey: null };
				}
				const { createOnedevClient } = await import(
					"../changes/utils/onedev-api"
				);
				const client = createOnedevClient({ url, accessToken });
				return client.getIssuesByProjectPath(input.projectPath, {
					stateFilter: input.stateFilter,
					offset: input.offset,
					count: input.count,
				});
			}),

		getOnedevIssue: publicProcedure
			.input(
				z.object({
					projectPath: z.string(),
					issueNumber: z.number(),
				}),
			)
			.query(async ({ input }) => {
				const row = getSettings();
				const url = row.onedevUrl;
				const accessToken = row.onedevAccessToken;
				if (!url || !accessToken) {
					return null;
				}
				const { createOnedevClient } = await import(
					"../changes/utils/onedev-api"
				);
				const client = createOnedevClient({ url, accessToken });
				const { issues, projectKey } =
					await client.getIssuesByProjectPath(input.projectPath);
				const issue = issues.find(
					(i) => i.number === input.issueNumber,
				);
				if (!issue) return null;
				const fields = await client.getIssueFields(issue.id);
				return {
					...issue,
					fields,
					projectKey,
					projectPath: input.projectPath,
					externalUrl: `${url.replace(/\/+$/, "")}/${input.projectPath}/~issues/${issue.number}`,
				};
			}),

		updateOnedevIssueState: publicProcedure
			.input(
				z.object({
					issueId: z.number(),
					state: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const row = getSettings();
				const url = row.onedevUrl;
				const accessToken = row.onedevAccessToken;
				if (!url || !accessToken) {
					throw new Error("OneDev not configured");
				}
				const baseUrl = url.replace(/\/+$/, "");
				const response = await fetch(
					`${baseUrl}/~api/issues/${input.issueId}/state-transitions`,
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${accessToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ state: input.state }),
					},
				);
				if (!response.ok) {
					throw new Error(
						`Failed to update issue state: ${response.status}`,
					);
				}
				return { success: true };
			}),

		updateOnedevIssueFields: publicProcedure
			.input(
				z.object({
					issueId: z.number(),
					fields: z.record(z.string(), z.string().nullable()),
				}),
			)
			.mutation(async ({ input }) => {
				const row = getSettings();
				const url = row.onedevUrl;
				const accessToken = row.onedevAccessToken;
				if (!url || !accessToken) {
					throw new Error("OneDev not configured");
				}
				const baseUrl = url.replace(/\/+$/, "");
				const response = await fetch(
					`${baseUrl}/~api/issues/${input.issueId}/fields`,
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${accessToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify(input.fields),
					},
				);
				if (!response.ok) {
					throw new Error(
						`Failed to update issue fields: ${response.status}`,
					);
				}
				return { success: true };
			}),

		createOnedevIssue: publicProcedure
			.input(
				z.object({
					projectPath: z.string(),
					title: z.string(),
					description: z.string().optional(),
					type: z.string().optional(),
					priority: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const row = getSettings();
				const url = row.onedevUrl;
				const accessToken = row.onedevAccessToken;
				if (!url || !accessToken) {
					throw new Error("OneDev not configured");
				}
				const { createOnedevClient } = await import(
					"../changes/utils/onedev-api"
				);
				const client = createOnedevClient({ url, accessToken });
				const project = await client.getProjectWithKey(
					input.projectPath,
				);
				if (!project) {
					throw new Error(`Project ${input.projectPath} not found`);
				}
				const baseUrl = url.replace(/\/+$/, "");
				const response = await fetch(`${baseUrl}/~api/issues`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${accessToken}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						title: input.title,
						description: input.description ?? "",
						projectId: project.id,
					}),
				});
				if (!response.ok) {
					throw new Error(
						`Failed to create issue: ${response.status}`,
					);
				}
				const issueId = await response.json();

				// Set Type and Priority if provided
				if (input.type || input.priority) {
					const fields: Record<string, string> = {};
					if (input.type) fields.Type = input.type;
					if (input.priority) fields.Priority = input.priority;
					await fetch(`${baseUrl}/~api/issues/${issueId}/fields`, {
						method: "POST",
						headers: {
							Authorization: `Bearer ${accessToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify(fields),
					});
				}

				return { issueId, projectId: project.id };
			}),

		updateOnedevIssueTitle: publicProcedure
			.input(z.object({ issueId: z.number(), title: z.string() }))
			.mutation(async ({ input }) => {
				const row = getSettings();
				const url = row.onedevUrl;
				const accessToken = row.onedevAccessToken;
				if (!url || !accessToken) throw new Error("OneDev not configured");
				const baseUrl = url.replace(/\/+$/, "");
				const response = await fetch(
					`${baseUrl}/~api/issues/${input.issueId}/title`,
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${accessToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify(input.title),
					},
				);
				if (!response.ok) throw new Error(`Failed: ${response.status}`);
				return { success: true };
			}),

		updateOnedevIssueDescription: publicProcedure
			.input(z.object({ issueId: z.number(), description: z.string() }))
			.mutation(async ({ input }) => {
				const row = getSettings();
				const url = row.onedevUrl;
				const accessToken = row.onedevAccessToken;
				if (!url || !accessToken) throw new Error("OneDev not configured");
				const baseUrl = url.replace(/\/+$/, "");
				const response = await fetch(
					`${baseUrl}/~api/issues/${input.issueId}/description`,
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${accessToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify(input.description),
					},
				);
				if (!response.ok) throw new Error(`Failed: ${response.status}`);
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

		getProjectsBaseDir: publicProcedure.query(() => {
			const row = getSettings();
			return row.projectsBaseDir ?? null;
		}),

		setProjectsBaseDir: publicProcedure
			.input(z.object({ path: z.string().nullable() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, projectsBaseDir: input.path })
					.onConflictDoUpdate({
						target: settings.id,
						set: { projectsBaseDir: input.path },
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

		getOnedevBuilds: publicProcedure
			.input(z.object({ projectPath: z.string() }))
			.query(async ({ input }) => {
				const row = getSettings();
				const url = row.onedevUrl;
				const accessToken = row.onedevAccessToken;
				if (!url || !accessToken) return [];
				try {
					// First resolve projectPath to projectId
					const { createOnedevClient } = await import("../changes/utils/onedev-api");
					const client = createOnedevClient({ url, accessToken });
					const project = await client.getProjectByPath(input.projectPath);
					if (!project) return [];

					const res = await fetch(`${url}/~api/builds?offset=0&count=50&query=${encodeURIComponent(`"Project" is "${input.projectPath}"`)}`, {
						headers: { Authorization: `Bearer ${accessToken}` },
					});
					if (!res.ok) {
						// Fallback: load all builds and filter client-side
						const allRes = await fetch(`${url}/~api/builds?offset=0&count=100`, {
							headers: { Authorization: `Bearer ${accessToken}` },
						});
						if (!allRes.ok) return [];
						const allBuilds = (await allRes.json()) as { id: number; jobName: string; status: string; refName: string; submitDate: string; number: number; projectId: number; commitHash: string }[];
						return allBuilds
							.filter((b) => b.projectId === project.id)
							.slice(0, 5)
							.map((b) => ({
								id: b.id,
								jobName: b.jobName,
								status: b.status,
								refName: b.refName,
								submitDate: b.submitDate,
								number: b.number,
								commitHash: b.commitHash?.slice(0, 7) ?? "",
							}));
					}
					const builds = (await res.json()) as { id: number; jobName: string; status: string; refName: string; submitDate: string; number: number; commitHash: string }[];
					return builds.slice(0, 5).map((b) => ({
						id: b.id,
						jobName: b.jobName,
						status: b.status,
						refName: b.refName,
						submitDate: b.submitDate,
						number: b.number,
						commitHash: b.commitHash?.slice(0, 7) ?? "",
					}));
				} catch {
					return [];
				}
			}),

		getOnedevProjectInfo: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(async ({ input }) => {
				const row = getSettings();
				const onedevUrl = row.onedevUrl;
				const onedevToken = row.onedevAccessToken;
				if (!onedevUrl || !onedevToken) return null;
				try {
					const { projects } = await import("@superset/local-db");
					const project = localDb.select().from(projects).where(eq(projects.id, input.projectId)).get();
					if (!project) return null;
					const { getSimpleGitWithShellPath } = await import("../workspaces/utils/git-client");
					const git = await getSimpleGitWithShellPath(project.mainRepoPath);
					const remoteUrl = (await git.remote(["get-url", "origin"])).trim();
					const { detectGitProvider, extractOnedevProjectPath } = await import("../changes/utils/git-provider");
					const provider = detectGitProvider(remoteUrl, onedevUrl);
					if (provider !== "onedev") return { provider, remoteUrl, onedevProjectPath: null, onedevUrl: null };
					const projectPath = extractOnedevProjectPath(remoteUrl);
					return {
						provider: "onedev",
						remoteUrl,
						onedevProjectPath: projectPath,
						onedevUrl: projectPath ? `${onedevUrl}/${projectPath}` : null,
					};
				} catch {
					return null;
				}
			}),

		getOnedevActiveBranches: publicProcedure
			.input(z.object({ projectPath: z.string() }))
			.query(async ({ input }) => {
				const { projects } = await import("@superset/local-db");
				const allProjects = localDb.select().from(projects).all();
				for (const project of allProjects) {
					try {
						const { getSimpleGitWithShellPath } = await import("../workspaces/utils/git-client");
						const git = await getSimpleGitWithShellPath(project.mainRepoPath);
						const remotes = await git.getRemotes(true);
						const origin = remotes.find((r) => r.name === "origin");
						if (!origin?.refs?.fetch?.includes(input.projectPath)) continue;
						const branches = await git.branch(["-r", "--sort=-committerdate"]);
						return branches.all.slice(0, 10).map((name) => {
							const clean = name.replace("origin/", "");
							return { name: clean };
						});
					} catch {
						continue;
					}
				}
				return [];
			}),

		getOnedevRecentCommits: publicProcedure
			.input(z.object({ projectPath: z.string() }))
			.query(async ({ input }) => {
				const { projects } = await import("@superset/local-db");
				const allProjects = localDb.select().from(projects).all();
				// Find matching project by checking git remote
				for (const project of allProjects) {
					try {
						const { getSimpleGitWithShellPath } = await import("../workspaces/utils/git-client");
						const git = await getSimpleGitWithShellPath(project.mainRepoPath);
						const remotes = await git.getRemotes(true);
						const origin = remotes.find((r) => r.name === "origin");
						if (!origin?.refs?.fetch?.includes(input.projectPath)) continue;
						// Fetch latest from remote before reading log
						await git.fetch(["origin"]).catch(() => {});
						const log = await git.log({ maxCount: 10 });
						const allLog = await git.raw(["rev-list", "--count", "HEAD"]);
						const totalCount = Number.parseInt(allLog.trim(), 10) || 0;
						const contributors = [...new Set(log.all.map((c) => c.author_name).filter(Boolean))];
						return {
							commits: log.all.map((c) => ({
								hash: c.hash.slice(0, 7),
								message: c.message,
								author: c.author_name,
								date: c.date,
							})),
							totalCount,
							contributors,
						};
					} catch {
						continue;
					}
				}
				return { commits: [], totalCount: 0, contributors: [] };
			}),

		getOnedevPullRequests: publicProcedure
			.input(z.object({ projectPath: z.string() }))
			.query(async ({ input }) => {
				const row = getSettings();
				const url = row.onedevUrl;
				const accessToken = row.onedevAccessToken;
				if (!url || !accessToken) return [];
				try {
					const { createOnedevClient } = await import("../changes/utils/onedev-api");
					const client = createOnedevClient({ url, accessToken });
					const project = await client.getProjectByPath(input.projectPath);
					if (!project) return [];
					const res = await fetch(`${url}/~api/pulls?offset=0&count=10`, {
						headers: { Authorization: `Bearer ${accessToken}` },
					});
					if (!res.ok) return [];
					const pulls = (await res.json()) as { id: number; number: number; title: string; sourceBranch: string; targetBranch: string; status: string; submitDate: string; projectId: number }[];
					return pulls
						.filter((p) => p.projectId === project.id)
						.map((p) => ({
							id: p.id,
							number: p.number,
							title: p.title,
							sourceBranch: p.sourceBranch,
							status: p.status,
							submitDate: p.submitDate,
							url: `${url}/${input.projectPath}/~pulls/${p.id}`,
						}));
				} catch {
					return [];
				}
			}),

		getOnedevUsers: publicProcedure.query(async () => {
				const row = getSettings();
				const url = row.onedevUrl;
				const accessToken = row.onedevAccessToken;
				if (!url || !accessToken) return [];
				try {
					const res = await fetch(`${url}/~api/users?offset=0&count=100`, {
						headers: { Authorization: `Bearer ${accessToken}` },
					});
					if (!res.ok) return [];
					const users = (await res.json()) as { name: string; fullName: string | null; disabled: boolean; serviceAccount: boolean }[];
					return users.filter((u) => !u.disabled && !u.serviceAccount).map((u) => ({
						name: u.name,
						fullName: u.fullName,
					}));
				} catch {
					return [];
				}
			}),

		updateOnedevIssueAssignee: publicProcedure
			.input(z.object({ issueId: z.number(), assignee: z.string().nullable() }))
			.mutation(async ({ input }) => {
				const row = getSettings();
				const url = row.onedevUrl;
				const accessToken = row.onedevAccessToken;
				if (!url || !accessToken) throw new Error("OneDev not configured");
				const res = await fetch(`${url}/~api/issues/${input.issueId}/fields`, {
					method: "POST",
					headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
					body: JSON.stringify({ Assignees: input.assignee }),
				});
				if (!res.ok) throw new Error(`Failed to update assignee: ${res.status}`);
				return { success: true };
			}),

		createOnedevProject: publicProcedure
			.input(z.object({
				name: z.string(),
				description: z.string().optional(),
				issueManagement: z.boolean().default(true),
				codeManagement: z.boolean().default(true),
			}))
			.mutation(async ({ input }) => {
				const row = getSettings();
				const url = row.onedevUrl;
				const accessToken = row.onedevAccessToken;
				if (!url || !accessToken) throw new Error("OneDev not configured");
				const res = await fetch(`${url}/~api/projects`, {
					method: "POST",
					headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
					body: JSON.stringify({
						name: input.name,
						description: input.description ?? "",
						issueManagement: input.issueManagement,
						codeManagement: input.codeManagement,
						packManagement: false,
						timeTracking: false,
						gitPackConfig: {},
						codeAnalysisSetting: {},
					}),
				});
				if (!res.ok) {
					const text = await res.text().catch(() => "");
					throw new Error(`Failed to create project: ${res.status} ${text}`);
				}
				const projectId = await res.json();
				return { projectId };
			}),

		getOnedevIssueComments: publicProcedure
			.input(z.object({ issueId: z.number() }))
			.query(async ({ input }) => {
				const row = getSettings();
				const url = row.onedevUrl;
				const accessToken = row.onedevAccessToken;
				if (!url || !accessToken) return [];
				try {
					const res = await fetch(`${url}/~api/issues/${input.issueId}/comments`, {
						headers: { Authorization: `Bearer ${accessToken}` },
					});
					if (!res.ok) return [];
					return (await res.json()) as { id: number; content: string; date: string; userId: number }[];
				} catch {
					return [];
				}
			}),

		createOnedevIssueComment: publicProcedure
			.input(z.object({ issueId: z.number(), content: z.string() }))
			.mutation(async ({ input }) => {
				const row = getSettings();
				const url = row.onedevUrl;
				const accessToken = row.onedevAccessToken;
				if (!url || !accessToken) throw new Error("OneDev not configured");
				// Get issue to find submitterId for the userId field
				const issueRes = await fetch(`${url}/~api/issues/${input.issueId}`, {
					headers: { Authorization: `Bearer ${accessToken}` },
				});
				if (!issueRes.ok) throw new Error("Failed to fetch issue");
				const issue = (await issueRes.json()) as { submitterId: number };
				const res = await fetch(`${url}/~api/issue-comments`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${accessToken}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						issueId: input.issueId,
						content: input.content,
						userId: issue.submitterId,
					}),
				});
				if (!res.ok) throw new Error(`Failed to create comment: ${res.status}`);
				return { success: true };
			}),

		setTelemetryEnabled: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(() => {
				return { success: true };
			}),
	});
};
