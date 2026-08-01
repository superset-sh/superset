/**
 * Registry of every localStorage key family the renderer persists.
 *
 * Policy (see "Persisted renderer state" in apps/desktop/AGENTS.md): every
 * live persisted key declares what bounds it and what deletes it in this
 * module. When a feature stops writing a key, the key moves to DEAD_KEYS in
 * persisted-keys.ts — otherwise it survives on user profiles forever. A 2026-07 audit found
 * 53 KB of `pending-workspaces-*` records unread since May, plus seven other
 * dead families. The registry-enforcement test fails when a file writes
 * localStorage without an entry here.
 */

interface PersistedKeyOwner {
	/** Writer module, repo-relative from apps/desktop/. */
	file: string;
	/** Key literals this file writes; `*` marks a dynamic suffix. */
	keys: string[];
	/** What bounds the stored size and what deletes stale data. */
	policy: string;
}

export const PERSISTED_KEY_REGISTRY: PersistedKeyOwner[] = [
	// --- collection blobs (one key per org, map of rows) ---
	{
		file: "src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts",
		keys: [
			"v2-workspace-local-state-*",
			"v2-sidebar-projects-*",
			"v2-sidebar-sections-*",
			"v2-terminal-presets-*",
			"v2-user-preferences-*",
			"failed-workspace-creates-*",
		],
		policy:
			"rows deleted with their workspace/project/section; workspace rows also reconcile-GC'd against live v2Workspaces (useReconcileStaleWorkspaceState)",
	},
	{
		file: "src/renderer/routes/_authenticated/providers/CollectionsProvider/withQuotaGuard.ts",
		keys: [],
		policy: "infra wrapper for the collection blobs above; owns no keys",
	},
	// --- terminal snapshots (bounded by #6036 GC) ---
	{
		file: "src/renderer/lib/terminal/terminal-runtime.ts",
		keys: ["terminal-buffer:*", "terminal-dims:*"],
		policy: "14d TTL + 2M-char total budget, boot GC in terminal-buffer-gc",
	},
	{
		file: "src/renderer/lib/terminal/terminal-buffer-gc.ts",
		keys: ["terminal-buffer-persisted-at"],
		policy: "index for the TTL GC; self-pruning",
	},
	// --- generic persistence infra ---
	{
		file: "src/renderer/lib/trpc-storage.ts",
		keys: ["<store>:version", "<store>:pending-snapshot"],
		policy: "infra for ringtone/tabs/theme stores; fixed-size markers",
	},
	{
		file: "src/renderer/lib/persistent-hash-history/persistent-hash-history.ts",
		keys: ["router-history"],
		policy: "entry-capped history",
	},
	{
		file: "src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/paneScrollStateCache/paneScrollStateCache.ts",
		keys: ["v2-pane-scroll-state-v1"],
		policy: "LRU capped at 250 entries",
	},
	// --- zustand persist stores (singleton unless noted) ---
	{
		file: "src/renderer/stores/changes/store.ts",
		keys: ["changes-store"],
		policy:
			"selectedFiles keyed by v1 workspaceId; deselect deletes the key (v1 surface — move to DEAD_KEYS at v1 sunset)",
	},
	{
		file: "src/renderer/stores/prompt-history.ts",
		keys: ["prompt-history"],
		policy: "50 entries capped at 5,000 characters each",
	},
	{
		file: "src/renderer/stores/tabs/store.ts",
		keys: ["tabs-storage"],
		policy:
			"v1 tab layout keyed per workspace, unpruned (v1 surface — move to DEAD_KEYS at v1 sunset)",
	},
	{
		file: "src/renderer/stores/theme/store.ts",
		keys: ["theme-storage", "theme-terminal", "theme-id", "theme-type"],
		policy: "singleton theme prefs",
	},
	{
		file: "src/renderer/stores/ringtone/store.ts",
		keys: ["ringtone-storage"],
		policy: "singleton prefs",
	},
	{
		file: "src/renderer/stores/settings.ts",
		keys: ["settings"],
		policy: "singleton prefs",
	},
	{
		file: "src/renderer/stores/chat-preferences/store.ts",
		keys: ["chat-preferences"],
		policy: "singleton prefs",
	},
	{
		file: "src/renderer/stores/markdown-preferences/store.ts",
		keys: ["markdown-preferences"],
		policy: "singleton prefs",
	},
	{
		file: "src/renderer/stores/file-explorer.ts",
		keys: ["file-explorer-store"],
		policy:
			"expandedFolders keyed by folder path, unpruned (v1 surface — move to DEAD_KEYS at v1 sunset)",
	},
	{
		file: "src/renderer/stores/ports/store.ts",
		keys: ["ports-store"],
		policy: "singleton UI state",
	},
	{
		file: "src/renderer/stores/search-dialog-state.ts",
		keys: ["search-dialog-store"],
		policy: "singleton UI state",
	},
	{
		file: "src/renderer/stores/sidebar-state.ts",
		keys: ["sidebar-store"],
		policy: "singleton UI state",
	},
	{
		file: "src/renderer/stores/workspace-sidebar-state.ts",
		keys: ["workspace-sidebar-store"],
		policy: "singleton UI state",
	},
	{
		file: "src/renderer/stores/sidebar-workspaces-collapse.ts",
		keys: ["sidebar-workspaces-collapse"],
		policy: "singleton UI state",
	},
	{
		file: "src/renderer/stores/v2-local-override.ts",
		keys: ["v2-local-override-v2"],
		policy: "singleton flag",
	},
	{
		file: "src/renderer/stores/v2-workspace-create-defaults.ts",
		keys: ["v2-workspace-create-defaults"],
		policy: "singleton defaults",
	},
	{
		file: "src/renderer/stores/v2-project-local-meta.ts",
		keys: ["v2-project-local-meta"],
		policy: "per-project meta; small fixed fields",
	},
	{
		file: "src/renderer/stores/v2-section-local-meta.ts",
		keys: ["v2-section-local-meta"],
		policy: "per-section meta; small fixed fields",
	},
	{
		file: "src/renderer/stores/v2-changes-sections/store.ts",
		keys: ["v2-changes-sections-v1"],
		policy: "singleton UI state",
	},
	{
		file: "src/renderer/stores/v2-notifications/store.ts",
		keys: ["v2-notifications-v1"],
		policy: "entry-capped notification list",
	},
	{
		file: "src/renderer/stores/v2-available-banner/store.ts",
		keys: ["v2-available-banner-v1"],
		policy: "singleton dismissal flag",
	},
	{
		file: "src/renderer/stores/hiring-banner/store.ts",
		keys: ["hiring-banner-v1"],
		policy: "singleton dismissal flag",
	},
	{
		file: "src/renderer/stores/terminal-close-confirm/store.ts",
		keys: ["terminal-close-confirm-v1"],
		policy: "singleton flag",
	},
	{
		file: "src/renderer/stores/automation-failures/store.ts",
		keys: ["automation-failures-v1"],
		policy: "entry-capped failure list",
	},
	{
		file: "src/renderer/stores/app-version-history/store.ts",
		keys: ["app-version-history-v1"],
		policy: "entry-capped version list",
	},
	{
		file: "src/renderer/stores/createDismissalsStore/createDismissalsStore.ts",
		keys: ["desktop-notice-dismissals-v1", "v2-setup-card-dismissals-v1"],
		policy: "dismissal id sets; bounded by notice/card cardinality",
	},
	{
		file: "src/renderer/stores/workspace-agents-row.ts",
		keys: ["workspace-agents-row"],
		policy: "singleton UI state",
	},
	{
		file: "src/renderer/stores/inline-workspace-ports.ts",
		keys: ["inline-workspace-ports"],
		policy: "singleton UI state",
	},
	{
		file: "src/renderer/hotkeys/stores/hotkeyOverridesStore.ts",
		keys: ["hotkey-overrides"],
		policy: "bounded by hotkey action count",
	},
	{
		file: "src/renderer/hotkeys/stores/keyboardPreferencesStore.ts",
		keys: ["keyboard-preferences"],
		policy: "singleton prefs",
	},
	{
		file: "src/renderer/routes/_authenticated/_dashboard/tasks/stores/tasks-filter-state.ts",
		keys: ["tasks-filter-state"],
		policy: "singleton filter state",
	},
	// --- raw setItem call sites (all small fixed-size values) ---
	{
		file: "src/renderer/components/PostHogUserIdentifier/PostHogUserIdentifier.tsx",
		keys: ["active_organization_id"],
		policy: "singleton id",
	},
	{
		file: "src/renderer/hooks/useAgentModelPreference/useAgentModelPreference.ts",
		keys: ["lastSelectedV2WorkspaceCreateModelByPreset"],
		policy: "map bounded by preset count",
	},
	{
		file: "src/renderer/hooks/useAgentEffortPreference/useAgentEffortPreference.ts",
		keys: ["lastSelectedV2WorkspaceCreateEffortByPreset"],
		policy: "map bounded by preset count",
	},
	{
		file: "src/renderer/hooks/useAgentLaunchPreferences/useAgentLaunchPreferences.ts",
		keys: [
			"lastSelectedV2WorkspaceCreateAgent",
			"lastOpenedInProjectId",
			"lastSelectedAgent",
			"agentAutoRun",
		],
		policy: "singleton ids",
	},
	{
		file: "src/renderer/routes/_authenticated/layout.tsx",
		keys: ["lastViewedWorkspaceId"],
		policy: "singleton id",
	},
	{
		file: "src/renderer/routes/_authenticated/_dashboard/utils/workspace-navigation.ts",
		keys: ["lastViewedWorkspaceId"],
		policy: "singleton id",
	},
	{
		file: "src/renderer/routes/_authenticated/_dashboard/automations/$automationId/components/PreviousRunsList/PreviousRunsList.tsx",
		keys: ["lastViewedWorkspaceId"],
		policy: "singleton id",
	},
	{
		file: "src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/richInputOpenStore.ts",
		keys: ["superset.terminalRichInputOpen"],
		policy: "singleton flag",
	},
	{
		file: "src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/DiffPane/components/AgentCommentComposer/hooks/useDiffCommentTarget/useDiffCommentTarget.ts",
		keys: [
			"lastSelectedDiffCommentNewAgentConfigId",
			"lastSelectedDiffCommentPlacement",
		],
		policy: "singleton ids",
	},
	{
		file: "src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/PropertiesSidebar/components/OpenInWorkspaceV2/OpenInWorkspaceV2.tsx",
		keys: ["lastSelectedV2TaskAgent"],
		policy: "singleton id",
	},
	{
		file: "src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/RunIssuesInWorkspacePopover/RunIssuesInWorkspacePopover.tsx",
		keys: ["lastSelectedV2IssueBatchAgent"],
		policy: "singleton id",
	},
	{
		file: "src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/RunInWorkspacePopoverV2/RunInWorkspacePopoverV2.tsx",
		keys: ["lastSelectedV2TaskBatchAgent"],
		policy: "singleton id",
	},
	{
		file: "src/renderer/routes/_authenticated/components/DaemonAutoUpdateFailureDialog/DaemonAutoUpdateFailureDialog.tsx",
		keys: ["daemon-update-dismissed-failure-*"],
		policy: "one small value per org",
	},
	{
		file: "src/renderer/routes/_authenticated/hooks/useDevSeedV2Sidebar/useDevSeedV2Sidebar.ts",
		keys: ["superset:dev:v2-sidebar-seeded"],
		policy: "dev-only singleton flag",
	},
	{
		file: "src/renderer/routes/sign-in/page.tsx",
		keys: ["superset-last-auth-method"],
		policy: "singleton id",
	},
];
