/**
 * Allowlist of renderer localStorage writers and their live key families.
 * CI fails on unregistered or stale writer files. `*` marks a dynamic part.
 * Bounds and deletion requirements live in apps/desktop/AGENTS.md.
 */
export const PERSISTED_KEY_REGISTRY: ReadonlyArray<
	readonly [file: string, keys: readonly string[]]
> = [
	[
		"src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts",
		[
			"v2-workspace-local-state-*",
			"v2-sidebar-projects-*",
			"v2-sidebar-sections-*",
			"v2-terminal-presets-*",
			"v2-user-preferences-*",
			"failed-workspace-creates-*",
		],
	],
	[
		"src/renderer/routes/_authenticated/providers/CollectionsProvider/withQuotaGuard.ts",
		[],
	],
	[
		"src/renderer/lib/terminal/terminal-runtime.ts",
		["terminal-buffer:*", "terminal-dims:*"],
	],
	[
		"src/renderer/lib/terminal/terminal-buffer-gc.ts",
		["terminal-buffer-persisted-at"],
	],
	[
		"src/renderer/lib/trpc-storage.ts",
		["<store>:version", "<store>:pending", "<store>:pending:updatedAt"],
	],
	["src/renderer/lib/posthog.ts", ["ph_*_posthog", "__ph_opt_in_out_*"]],
	[
		"src/renderer/lib/persistent-hash-history/persistent-hash-history.ts",
		["router-history"],
	],
	[
		"src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/paneScrollStateCache/paneScrollStateCache.ts",
		["v2-pane-scroll-state-v1"],
	],
	["src/renderer/stores/changes/store.ts", ["changes-store"]],
	["src/renderer/stores/prompt-history.ts", ["prompt-history"]],
	["src/renderer/stores/tabs/store.ts", ["tabs-storage"]],
	[
		"src/renderer/stores/theme/store.ts",
		["theme-storage", "theme-terminal", "theme-id", "theme-type"],
	],
	["src/renderer/stores/ringtone/store.ts", ["ringtone-storage"]],
	["src/renderer/stores/settings.ts", ["settings"]],
	["src/renderer/stores/chat-preferences/store.ts", ["chat-preferences"]],
	[
		"src/renderer/stores/markdown-preferences/store.ts",
		["markdown-preferences"],
	],
	["src/renderer/stores/file-explorer.ts", ["file-explorer-store"]],
	["src/renderer/stores/ports/store.ts", ["ports-store"]],
	["src/renderer/stores/search-dialog-state.ts", ["search-dialog-store"]],
	["src/renderer/stores/sidebar-state.ts", ["sidebar-store"]],
	[
		"src/renderer/stores/workspace-sidebar-state.ts",
		["workspace-sidebar-store"],
	],
	[
		"src/renderer/stores/sidebar-workspaces-collapse.ts",
		["sidebar-workspaces-collapse"],
	],
	["src/renderer/stores/v2-local-override.ts", ["v2-local-override-v2"]],
	[
		"src/renderer/stores/v2-workspace-create-defaults.ts",
		["v2-workspace-create-defaults"],
	],
	["src/renderer/stores/v2-project-local-meta.ts", ["v2-project-local-meta"]],
	["src/renderer/stores/v2-section-local-meta.ts", ["v2-section-local-meta"]],
	[
		"src/renderer/stores/v2-changes-sections/store.ts",
		["v2-changes-sections-v1"],
	],
	["src/renderer/stores/v2-notifications/store.ts", ["v2-notifications-v1"]],
	[
		"src/renderer/stores/v2-available-banner/store.ts",
		["v2-available-banner-v1"],
	],
	["src/renderer/stores/hiring-banner/store.ts", ["hiring-banner-v1"]],
	[
		"src/renderer/stores/terminal-close-confirm/store.ts",
		["terminal-close-confirm-v1"],
	],
	[
		"src/renderer/stores/automation-failures/store.ts",
		["automation-failures-v1"],
	],
	[
		"src/renderer/stores/app-version-history/store.ts",
		["app-version-history-v1"],
	],
	[
		"src/renderer/stores/createDismissalsStore/createDismissalsStore.ts",
		["desktop-notice-dismissals-v1", "v2-setup-card-dismissals-v1"],
	],
	["src/renderer/stores/workspace-agents-row.ts", ["workspace-agents-row"]],
	["src/renderer/stores/inline-workspace-ports.ts", ["inline-workspace-ports"]],
	["src/renderer/hotkeys/stores/hotkeyOverridesStore.ts", ["hotkey-overrides"]],
	[
		"src/renderer/hotkeys/stores/keyboardPreferencesStore.ts",
		["keyboard-preferences"],
	],
	[
		"src/renderer/routes/_authenticated/_dashboard/tasks/stores/tasks-filter-state.ts",
		["tasks-filter-state"],
	],
	[
		"src/renderer/components/PostHogUserIdentifier/PostHogUserIdentifier.tsx",
		["active_organization_id"],
	],
	[
		"src/renderer/hooks/useAgentModelPreference/useAgentModelPreference.ts",
		["lastSelectedV2WorkspaceCreateModelByPreset"],
	],
	[
		"src/renderer/hooks/useAgentEffortPreference/useAgentEffortPreference.ts",
		["lastSelectedV2WorkspaceCreateEffortByPreset"],
	],
	[
		"src/renderer/hooks/useAgentLaunchPreferences/useAgentLaunchPreferences.ts",
		[
			"lastSelectedV2WorkspaceCreateAgent",
			"lastOpenedInProjectId",
			"lastSelectedAgent",
			"agentAutoRun",
		],
	],
	["src/renderer/routes/_authenticated/layout.tsx", ["lastViewedWorkspaceId"]],
	[
		"src/renderer/routes/_authenticated/_dashboard/utils/workspace-navigation.ts",
		["lastViewedWorkspaceId"],
	],
	[
		"src/renderer/routes/_authenticated/_dashboard/automations/$automationId/components/PreviousRunsList/PreviousRunsList.tsx",
		["lastViewedWorkspaceId"],
	],
	[
		"src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/richInputOpenStore.ts",
		["superset.terminalRichInputOpen"],
	],
	[
		"src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/DiffPane/components/AgentCommentComposer/hooks/useDiffCommentTarget/useDiffCommentTarget.ts",
		[
			"lastSelectedDiffCommentNewAgentConfigId",
			"lastSelectedDiffCommentPlacement",
		],
	],
	[
		"src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/PropertiesSidebar/components/OpenInWorkspaceV2/OpenInWorkspaceV2.tsx",
		["lastSelectedV2TaskAgent"],
	],
	[
		"src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/RunIssuesInWorkspacePopover/RunIssuesInWorkspacePopover.tsx",
		["lastSelectedV2IssueBatchAgent"],
	],
	[
		"src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/RunInWorkspacePopoverV2/RunInWorkspacePopoverV2.tsx",
		["lastSelectedV2TaskBatchAgent"],
	],
	[
		"src/renderer/routes/_authenticated/components/DaemonAutoUpdateFailureDialog/DaemonAutoUpdateFailureDialog.tsx",
		["daemon-update-dismissed-failure-*"],
	],
	[
		"src/renderer/routes/_authenticated/hooks/useDevSeedV2Sidebar/useDevSeedV2Sidebar.ts",
		["superset:dev:v2-sidebar-seeded"],
	],
	["src/renderer/routes/sign-in/page.tsx", ["superset-last-auth-method"]],
];
