import {
	setupSingleAgent,
	teardownSingleAgent,
	writeSharedDisabledAgentIds,
} from "@superset/agent-setup";
import type { SupportedLocale } from "@superset/i18n/locales";
import { isSupportedLocale } from "@superset/i18n/locales";
import {
	EXTERNAL_APPS,
	NON_EDITOR_APPS,
	settings,
	type TerminalPreset,
} from "@superset/local-db";
import {
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
	DEFAULT_TERMINAL_PRESET_AGENT_TYPES,
} from "@superset/shared/agent-command";
import { NOTIFICATION_VOLUME_LIMITS } from "@superset/shared/settings-constraints";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { app } from "electron";
import { env } from "main/env.main";
import { exitImmediately } from "main/index";
import { hasCustomRingtone } from "main/lib/custom-ringtones";
import { getHostServiceCoordinator } from "main/lib/host-service-coordinator";
import { applyAppLanguage, languageEvents } from "main/lib/language";
import { localDb } from "main/lib/local-db";
import {
	DEFAULT_CONFIRM_ON_QUIT,
	DEFAULT_EXPOSE_HOST_SERVICE_VIA_RELAY,
	DEFAULT_SHOW_RESOURCE_MONITOR,
	DEFAULT_SHOW_USAGE_IN_SIDEBAR,
	DEFAULT_TERMINAL_COPY_ON_SELECT,
	DEFAULT_TERMINAL_PARKED_RUNTIME_CAP,
	DEFAULT_WAIT_FOR_SETUP_BEFORE_AGENT,
	MAX_TERMINAL_PARKED_RUNTIME_CAP,
	MIN_TERMINAL_PARKED_RUNTIME_CAP,
} from "shared/constants";
import {
	CUSTOM_RINGTONE_ID,
	DEFAULT_RINGTONE_ID,
	isBuiltInRingtoneId,
} from "shared/ringtones";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { loadToken } from "../auth/utils/auth-functions";
import {
	acknowledgeCliTerminalScripts,
	isPendingCliTerminalScript,
} from "./cli-terminal-script-import";
import {
	setFontSettingsSchema,
	transformFontSettings,
} from "./font-settings.utils";
import { getGitAuthorName, getGitHubUsername } from "./git-author";
import {
	normalizeTerminalPresets,
	type PresetWithUnknownMode,
	shouldPersistNormalizedTerminalPresets,
} from "./preset-execution-mode";

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

const DEFAULT_PRESETS: Omit<TerminalPreset, "id">[] =
	DEFAULT_TERMINAL_PRESET_AGENT_TYPES.map((name) => ({
		name,
		description: AGENT_PRESET_DESCRIPTIONS[name],
		cwd: "",
		commands: AGENT_PRESET_COMMANDS[name],
	}));

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

export const createSettingsRouter = () => {
	return router({
		getTerminalPresets: publicProcedure.query(() => {
			const row = getSettings();
			if (!row.terminalPresetsInitialized) {
				return initializeDefaultPresets();
			}
			return getNormalizedTerminalPresets();
		}),
		getPendingCliTerminalScripts: publicProcedure
			.input(z.object({ organizationId: z.string().min(1) }))
			.query(({ input }) =>
				getNormalizedTerminalPresets().filter((script) =>
					isPendingCliTerminalScript(script, input.organizationId),
				),
			),
		acknowledgeCliTerminalScripts: publicProcedure
			.input(
				z.object({
					organizationId: z.string().min(1),
					ids: z.array(z.string()).min(1),
				}),
			)
			.mutation(({ input }) =>
				// Immediate transaction: a concurrent `superset scripts add` must not
				// land between this read and write or its row would be dropped.
				localDb.transaction(
					() => {
						const result = acknowledgeCliTerminalScripts({
							scripts: getNormalizedTerminalPresets(),
							organizationId: input.organizationId,
							ids: input.ids,
						});
						if (result.changed) saveTerminalPresets(result.scripts);
						return { acknowledged: result.changed };
					},
					{ behavior: "immediate" },
				),
			),
		getLanguage: publicProcedure.query(() => {
			const row = getSettings();
			const stored = row.language;
			return stored && isSupportedLocale(stored) ? stored : null;
		}),

		onLanguageChange: publicProcedure.subscription(() =>
			observable<SupportedLocale | null>((emit) => {
				const notify = (stored: string | null) =>
					emit.next(stored && isSupportedLocale(stored) ? stored : null);
				languageEvents.on("change", notify);
				notify(getSettings().language);
				return () => {
					languageEvents.off("change", notify);
				};
			}),
		),

		setLanguage: publicProcedure
			.input(z.object({ language: z.string().nullable() }))
			.mutation(async ({ input }) => {
				const value =
					input.language === null || input.language === "auto"
						? null
						: input.language;
				if (value !== null && !isSupportedLocale(value)) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Unsupported language: ${value}`,
					});
				}
				// Target the row getSettings() reads: legacy DBs can hold a non-1
				// row id, and upserting id 1 there would split settings across
				// two rows, so getLanguage would keep reading the old row's null.
				const { id } = getSettings();
				localDb
					.insert(settings)
					.values({ id, language: value })
					.onConflictDoUpdate({
						target: settings.id,
						set: { language: value },
					})
					.run();
				// The application and tray menus resolve their labels when they are
				// built, so they need an explicit rebuild on a language change.
				// Awaited: the catalog for the new locale loads on demand.
				await applyAppLanguage(value);
			}),

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

		getExposeHostServiceViaRelay: publicProcedure.query(() => {
			const row = getSettings();
			return (
				row.exposeHostServiceViaRelay ?? DEFAULT_EXPOSE_HOST_SERVICE_VIA_RELAY
			);
		}),

		setExposeHostServiceViaRelay: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(async ({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, exposeHostServiceViaRelay: input.enabled })
					.onConflictDoUpdate({
						target: settings.id,
						set: { exposeHostServiceViaRelay: input.enabled },
					})
					.run();

				// Restart host services, including missing authenticated orgs, so
				// they pick up the new RELAY_URL. No-op when not signed in.
				const { token } = await loadToken();
				if (!token) {
					return { restartedOrgCount: 0 };
				}

				const coordinator = getHostServiceCoordinator();
				const restartedOrgCount = await coordinator.restartAll({
					authToken: token,
					cloudApiUrl: env.NEXT_PUBLIC_API_URL,
				});

				return { restartedOrgCount };
			}),

		getWaitForSetupBeforeAgent: publicProcedure.query(() => {
			const row = getSettings();
			return row.waitForSetupBeforeAgent ?? DEFAULT_WAIT_FOR_SETUP_BEFORE_AGENT;
		}),

		setWaitForSetupBeforeAgent: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, waitForSetupBeforeAgent: input.enabled })
					.onConflictDoUpdate({
						target: settings.id,
						set: { waitForSetupBeforeAgent: input.enabled },
					})
					.run();

				return { success: true };
			}),

		restartApp: publicProcedure.mutation(() => {
			app.relaunch();
			exitImmediately();
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

		getNotificationVolume: publicProcedure.query(() => {
			const row = getSettings();
			return row.notificationVolume ?? 100;
		}),

		setNotificationVolume: publicProcedure
			.input(
				z.object({
					volume: z
						.number()
						.min(NOTIFICATION_VOLUME_LIMITS.min)
						.max(NOTIFICATION_VOLUME_LIMITS.max),
				}),
			)
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, notificationVolume: input.volume })
					.onConflictDoUpdate({
						target: settings.id,
						set: { notificationVolume: input.volume },
					})
					.run();

				return { success: true };
			}),

		getFontSettings: publicProcedure.query(() => {
			const row = getSettings();
			return {
				terminalFontFamily: row.terminalFontFamily ?? null,
				terminalFontSize: row.terminalFontSize ?? null,
				terminalLineHeight: row.terminalLineHeight ?? null,
				terminalLetterSpacing: row.terminalLetterSpacing ?? null,
				terminalFontWeight: row.terminalFontWeight ?? null,
				terminalLigatures: row.terminalLigatures ?? null,
				terminalMinimumContrast: row.terminalMinimumContrast ?? null,
				terminalCursorStyle: row.terminalCursorStyle ?? null,
				terminalCursorBlink: row.terminalCursorBlink ?? null,
				editorFontFamily: row.editorFontFamily ?? null,
				editorFontSize: row.editorFontSize ?? null,
				editorLineHeight: row.editorLineHeight ?? null,
				editorLetterSpacing: row.editorLetterSpacing ?? null,
				editorFontWeight: row.editorFontWeight ?? null,
				editorLigatures: row.editorLigatures ?? null,
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

		getTerminalParkedRuntimeCap: publicProcedure.query(() => {
			const row = getSettings();
			return (
				row.terminalParkedRuntimeCap ?? DEFAULT_TERMINAL_PARKED_RUNTIME_CAP
			);
		}),

		setTerminalParkedRuntimeCap: publicProcedure
			.input(
				z.object({
					cap: z
						.number()
						.int()
						.min(MIN_TERMINAL_PARKED_RUNTIME_CAP)
						.max(MAX_TERMINAL_PARKED_RUNTIME_CAP),
				}),
			)
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, terminalParkedRuntimeCap: input.cap })
					.onConflictDoUpdate({
						target: settings.id,
						set: { terminalParkedRuntimeCap: input.cap },
					})
					.run();

				return { success: true };
			}),

		getTerminalCopyOnSelect: publicProcedure.query(() => {
			const row = getSettings();
			return row.terminalCopyOnSelect ?? DEFAULT_TERMINAL_COPY_ON_SELECT;
		}),

		setTerminalCopyOnSelect: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => {
				localDb
					.insert(settings)
					.values({ id: 1, terminalCopyOnSelect: input.enabled })
					.onConflictDoUpdate({
						target: settings.id,
						set: { terminalCopyOnSelect: input.enabled },
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

		getShowUsageInSidebar: publicProcedure.query(() => {
			const row = getSettings();
			return row.showUsageInSidebar ?? DEFAULT_SHOW_USAGE_IN_SIDEBAR;
		}),

		setShowUsageInSidebar: publicProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(({ input }) => {
				// Target the row getSettings() reads: legacy DBs can hold a non-1
				// row id, and upserting id 1 there would split settings across
				// two rows.
				const { id } = getSettings();
				localDb
					.insert(settings)
					.values({ id, showUsageInSidebar: input.enabled })
					.onConflictDoUpdate({
						target: settings.id,
						set: { showUsageInSidebar: input.enabled },
					})
					.run();

				return { success: true };
			}),

		getBrowserHomepageUrl: publicProcedure.query(() => {
			const row = getSettings();
			return row.browserHomepageUrl ?? null;
		}),

		setBrowserHomepageUrl: publicProcedure
			.input(z.object({ url: z.string().trim().nullable() }))
			.mutation(({ input }) => {
				// An empty string clears the override; the pane falls back to about:blank.
				const url = input.url && input.url.length > 0 ? input.url : null;
				localDb
					.insert(settings)
					.values({ id: 1, browserHomepageUrl: url })
					.onConflictDoUpdate({
						target: settings.id,
						set: { browserHomepageUrl: url },
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

		/**
		 * Re-runs wrapper/settings/hook setup for one agent. Safety net for
		 * the settings-UI Add flow; returns `{ ran: false }` for unknown ids.
		 * Adding an agent expresses intent to integrate it, so a previously
		 * disabled hooks toggle is cleared first.
		 */
		setupAgent: publicProcedure
			.input(z.object({ agentId: z.string().min(1) }))
			.mutation(({ input }) => {
				const disabled = getSettings().disabledAgentHooks ?? [];
				if (disabled.includes(input.agentId)) {
					const next = disabled.filter((id) => id !== input.agentId);
					localDb
						.insert(settings)
						.values({ id: 1, disabledAgentHooks: next })
						.onConflictDoUpdate({
							target: settings.id,
							set: { disabledAgentHooks: next },
						})
						.run();
					writeSharedDisabledAgentIds(next);
				}
				const ran = setupSingleAgent(input.agentId);
				return { ran };
			}),

		getAgentHooksDisabled: publicProcedure.query(() => {
			return getSettings().disabledAgentHooks ?? [];
		}),

		/**
		 * Toggles Superset's hook integration for one agent. Disabling removes
		 * the managed entries from the agent's global config immediately;
		 * startup re-applies the choice so it survives older app versions
		 * re-adding them.
		 */
		setAgentHooksEnabled: publicProcedure
			.input(z.object({ agentId: z.string().min(1), enabled: z.boolean() }))
			.mutation(({ input }) => {
				const current = new Set(getSettings().disabledAgentHooks ?? []);
				if (input.enabled) {
					current.delete(input.agentId);
				} else {
					current.add(input.agentId);
				}
				const next = [...current];
				localDb
					.insert(settings)
					.values({ id: 1, disabledAgentHooks: next })
					.onConflictDoUpdate({
						target: settings.id,
						set: { disabledAgentHooks: next },
					})
					.run();
				writeSharedDisabledAgentIds(next);

				const ran = input.enabled
					? setupSingleAgent(input.agentId)
					: teardownSingleAgent(input.agentId);
				return { ran };
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
