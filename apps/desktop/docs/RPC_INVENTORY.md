# RPC Inventory

**Date:** 2026-03-09
**Status:** Inventory + refactor analysis

This document inventories the mounted RPC surfaces in this workspace and highlights namespace areas that are overly flat or mixed.

Scope:
- Shared app/API router in `packages/trpc`
- Desktop local Electron router in `apps/desktop`
- Desktop-mounted chat host router
- Desktop-mounted chat mastra router

Excluded:
- Docs, plans, tests, and example snippets

## Shared API (`packages/trpc`) - 63 procedures

| Group | Count | Procedures |
|---|---:|---|
| `admin` | 2 | `listUsers`, `deleteUser` |
| `agent` | 1 | `updateCommand` |
| `analytics` | 8 | `getActivationFunnel`, `getMarketingFunnel`, `getWAUTrend`, `getRetention`, `getWorkspacesLeaderboard`, `getSignupsTrend`, `getTrafficSources`, `getRevenueTrend` |
| `apiKey` | 1 | `create` |
| `billing` | 1 | `invoices` |
| `chat` | 2 | `getModels`, `updateTitle` |
| `device` | 2 | `heartbeat`, `listOnlineDevices` |
| `integration` | 1 | `list` |
| `integration.github` | 6 | `getInstallation`, `disconnect`, `triggerSync`, `listRepositories`, `listPullRequests`, `getStats` |
| `integration.linear` | 4 | `getConnection`, `disconnect`, `getTeams`, `updateConfig` |
| `integration.slack` | 2 | `getConnection`, `disconnect` |
| `organization` | 12 | `all`, `byId`, `bySlug`, `getInvitation`, `create`, `update`, `uploadLogo`, `delete`, `addMember`, `removeMember`, `leave`, `updateMemberRole` |
| `project` | 3 | `create`, `update`, `delete` |
| `project.secrets` | 3 | `upsert`, `delete`, `getDecrypted` |
| `task` | 7 | `all`, `byOrganization`, `byId`, `bySlug`, `create`, `update`, `delete` |
| `user` | 5 | `me`, `myOrganization`, `myOrganizations`, `updateProfile`, `uploadAvatar` |
| `workspace` | 3 | `ensure`, `create`, `delete` |

## Desktop Local RPC (`apps/desktop`) - 242 procedures

| Group | Count | Procedures |
|---|---:|---|
| `analytics` | 1 | `setUserId` |
| `auth` | 6 | `getStoredToken`, `getDeviceInfo`, `persistToken`, `onTokenChanged`, `signIn`, `signOut` |
| `autoUpdate` | 8 | `subscribe`, `getStatus`, `check`, `install`, `dismiss`, `simulateReady`, `simulateDownloading`, `simulateError` |
| `browser` | 16 | `register`, `unregister`, `navigate`, `goBack`, `goForward`, `reload`, `screenshot`, `evaluateJS`, `getConsoleLogs`, `consoleStream`, `onNewWindow`, `onContextMenuAction`, `openDevTools`, `getDevToolsUrl`, `getPageInfo`, `clearBrowsingData` |
| `browserHistory` | 4 | `getAll`, `search`, `upsert`, `clear` |
| `cache` | 1 | `clearElectricCache` |
| `config` | 6 | `shouldShowSetupCard`, `dismissSetupCard`, `getConfigFilePath`, `getConfigContent`, `getSetupOnboardingDefaults`, `updateConfig` |
| `external` | 5 | `openUrl`, `openInFinder`, `openInApp`, `copyPath`, `openFileInEditor` |
| `filesystem` | 12 | `readDirectory`, `searchFiles`, `searchFilesMulti`, `searchKeyword`, `createFile`, `createDirectory`, `rename`, `delete`, `move`, `copy`, `exists`, `stat` |
| `hotkeys` | 2 | `export`, `import` |
| `menu` | 1 | `subscribe` |
| `notifications` | 1 | `subscribe` |
| `permissions` | 6 | `getStatus`, `requestFullDiskAccess`, `requestAccessibility`, `requestMicrophone`, `requestAppleEvents`, `requestLocalNetwork` |
| `ports` | 3 | `getAll`, `subscribe`, `kill` |
| `projects` | 20 | `get`, `getDefaultApp`, `getRecents`, `selectDirectory`, `getBranchesLocal`, `getBranches`, `openNew`, `openFromPath`, `initGitAndOpen`, `cloneRepo`, `createEmptyRepo`, `update`, `reorder`, `refreshDefaultBranch`, `close`, `linkToNeon`, `getGitHubAvatar`, `getGitAuthor`, `triggerFaviconDiscovery`, `setProjectIcon` |
| `resourceMetrics` | 1 | `getSnapshot` |
| `ringtone` | 4 | `preview`, `stop`, `getCustom`, `importCustom` |
| `settings` | 44 | `getTerminalPresets`, `createTerminalPreset`, `updateTerminalPreset`, `deleteTerminalPreset`, `setDefaultPreset`, `setPresetAutoApply`, `reorderTerminalPresets`, `getDefaultPreset`, `getWorkspaceCreationPresets`, `getNewTabPresets`, `getSelectedRingtoneId`, `setSelectedRingtoneId`, `getConfirmOnQuit`, `setConfirmOnQuit`, `getShowPresetsBar`, `setShowPresetsBar`, `getUseCompactTerminalAddButton`, `setUseCompactTerminalAddButton`, `getTerminalLinkBehavior`, `setTerminalLinkBehavior`, `getFileOpenMode`, `setFileOpenMode`, `getAutoApplyDefaultPreset`, `setAutoApplyDefaultPreset`, `restartApp`, `getBranchPrefix`, `setBranchPrefix`, `getGitInfo`, `getDeleteLocalBranch`, `setDeleteLocalBranch`, `getNotificationSoundsMuted`, `setNotificationSoundsMuted`, `getFontSettings`, `setFontSettings`, `getShowResourceMonitor`, `setShowResourceMonitor`, `getWorktreeBaseDir`, `setWorktreeBaseDir`, `getOpenLinksInApp`, `setOpenLinksInApp`, `getDefaultEditor`, `setDefaultEditor`, `getTelemetryEnabled`, `setTelemetryEnabled` |
| `terminal` | 16 | `createOrAttach`, `write`, `ackColdRestore`, `resize`, `signal`, `kill`, `detach`, `clearScrollback`, `listDaemonSessions`, `killAllDaemonSessions`, `killDaemonSessionsForWorkspace`, `clearTerminalHistory`, `restartDaemon`, `getSession`, `getWorkspaceCwd`, `stream` |
| `uiState` | 7 | `tabs.get`, `tabs.set`, `theme.get`, `theme.set`, `hotkeys.get`, `hotkeys.set`, `hotkeys.subscribe` |
| `window` | 8 | `minimize`, `maximize`, `close`, `isMaximized`, `getPlatform`, `getHomeDir`, `selectDirectory`, `selectImageFile` |
| `changes` | 29 | `getBranches`, `switchBranch`, `updateBaseBranch`, `getFileContents`, `saveFile`, `readWorkingFile`, `readWorkingFileImage`, `commit`, `push`, `pull`, `sync`, `fetch`, `createPR`, `mergePR`, `stageFile`, `unstageFile`, `discardChanges`, `stageFiles`, `unstageFiles`, `stageAll`, `unstageAll`, `deleteUntracked`, `discardAllUnstaged`, `discardAllStaged`, `stash`, `stashIncludeUntracked`, `stashPop`, `getStatus`, `getCommitFiles` |
| `workspaces` | 41 | `create`, `createBranchWorkspace`, `openWorktree`, `openExternalWorktree`, `createFromPr`, `importAllWorktrees`, `canDelete`, `delete`, `close`, `canDeleteWorktree`, `deleteWorktree`, `refreshGitStatus`, `getAheadBehind`, `getGitHubStatus`, `getWorktreeInfo`, `getWorktreesByProject`, `getExternalWorktrees`, `onInitProgress`, `retryInit`, `getInitProgress`, `getSetupCommands`, `get`, `getAll`, `getAllGrouped`, `getPreviousWorkspace`, `getNextWorkspace`, `createSection`, `setSectionColor`, `renameSection`, `deleteSection`, `reorderSections`, `toggleSectionCollapsed`, `reorderWorkspacesInSection`, `moveWorkspacesToSection`, `moveWorkspaceToSection`, `reorder`, `reorderProjectChildren`, `update`, `setUnread`, `setActive`, `syncBranch` |

## Chat Host RPC (`chatService.*`) - 20 procedures

| Group | Count | Procedures |
|---|---:|---|
| `chatService.workspace` | 5 | `searchFiles`, `getSlashCommands`, `getMcpOverview`, `resolveSlashCommand`, `previewSlashCommand` |
| `chatService.auth` | 15 | `getAnthropicStatus`, `getOpenAIStatus`, `startOpenAIOAuth`, `completeOpenAIOAuth`, `cancelOpenAIOAuth`, `startAnthropicOAuth`, `completeAnthropicOAuth`, `cancelAnthropicOAuth`, `setAnthropicApiKey`, `getAnthropicEnvConfig`, `setAnthropicEnvConfig`, `clearAnthropicEnvConfig`, `clearAnthropicApiKey`, `setOpenAIApiKey`, `clearOpenAIApiKey` |

## Chat Mastra RPC (`chatMastraService.*`) - 12 procedures

| Group | Count | Procedures |
|---|---:|---|
| `chatMastraService.workspace` | 3 | `searchFiles`, `getMcpOverview`, `authenticateMcpServer` |
| `chatMastraService.session` | 6 | `getDisplayState`, `listMessages`, `sendMessage`, `restartFromMessage`, `stop`, `abort` |
| `chatMastraService.session.approval` | 1 | `respond` |
| `chatMastraService.session.question` | 1 | `respond` |
| `chatMastraService.session.plan` | 1 | `respond` |

## Refactor Candidates

These are structural inferences from the mounted router shapes.

| Priority | Area | Why it is mixed | Suggested nesting |
|---|---|---|---|
| High | `changes.*` | Branch, status, file, staging, and git operations are flattened into one namespace. | `changes.branches.*`, `changes.status.*`, `changes.files.*`, `changes.staging.*`, `changes.git.*` |
| High | `workspaces.*` | Seven distinct groups are merged into a flat surface, leaving ambiguous names like `get`, `update`, `delete`, `close`, and `reorder`. | `workspaces.query.*`, `workspaces.lifecycle.*`, `workspaces.git.*`, `workspaces.init.*`, `workspaces.sections.*`, `workspaces.state.*` |
| High | `projects.*` | Lookup, open/import flows, branch discovery, ordering, close, Neon linkage, and metadata are all siblings. | `projects.query.*`, `projects.open.*`, `projects.git.*`, `projects.manage.*`, `projects.cloud.*`, `projects.metadata.*` |
| Medium | `settings.*` | A 44-procedure catch-all for presets, app behavior, git prefs, editor prefs, ringtone, and telemetry stubs. | `settings.terminal.*`, `settings.editor.*`, `settings.notifications.*`, `settings.git.*`, `settings.app.*`, `settings.telemetry.*` |
| Medium | `organization.*` | Public lookup, invitation lookup, org settings, membership, leaving, and role changes are flat in one router. | `organization.query.*`, `organization.invitations.*`, `organization.members.*`, `organization.settings.*` |
| Medium | `chatService.auth.*` | Provider-specific flows are flattened, so Anthropic and OpenAI methods grow as sibling verb names. | `chatService.auth.openai.*`, `chatService.auth.anthropic.*` |
| Low | `auth.*` in desktop | Device identity, token persistence, event subscription, and sign-in/out flow are mixed. | `auth.device.*`, `auth.session.*`, `auth.flow.*`, `auth.events.*` |
| Low | `chatMastraService.session.stop` / `abort` | Both procedures call the same implementation. | Keep one canonical RPC and alias at the client if needed |

## Already Nested Well

- `integration.github.*`, `integration.linear.*`, `integration.slack.*`
- `project.secrets.*`
- `uiState.tabs.*`, `uiState.theme.*`, `uiState.hotkeys.*`
- `chatMastraService.session.approval.respond`, `session.question.respond`, `session.plan.respond`
