import { COMPANY } from "@superset/shared/constants";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useOpenNew } from "renderer/react-query/projects";
import { useCloseWorkspace } from "renderer/react-query/workspaces";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { useTabsStore } from "renderer/stores/tabs";
import {
	SYSTEM_THEME_ID,
	useSetTheme,
	useThemeId,
} from "renderer/stores/theme";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import type { CommandContext } from "../../types";

type ActionHandler = () => void | Promise<void>;

export function useCommandActions(ctx: CommandContext, closeMenu: () => void) {
	const navigate = useNavigate();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();
	const openNew = useOpenNew();
	const closeWorkspace = useCloseWorkspace();
	const checkForUpdates = electronTrpc.autoUpdate.check.useMutation();

	// Theme
	const setTheme = useSetTheme();
	const themeId = useThemeId();

	// Sidebar
	const {
		isOpen: isWorkspaceSidebarOpen,
		toggleCollapsed: toggleWorkspaceSidebarCollapsed,
		setOpen: setWorkspaceSidebarOpen,
	} = useWorkspaceSidebarStore();

	// Tabs/panes
	const addTab = useTabsStore((s) => s.addTab);
	const splitPaneVertical = useTabsStore((s) => s.splitPaneVertical);
	const splitPaneHorizontal = useTabsStore((s) => s.splitPaneHorizontal);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);

	// Helper to get active tab and focused pane for current workspace
	const getActiveTabAndPane = useCallback(() => {
		if (!ctx.workspaceId) return { tabId: null, paneId: null };
		const tabId = activeTabIds[ctx.workspaceId] ?? null;
		const paneId = tabId ? (focusedPaneIds[tabId] ?? null) : null;
		return { tabId, paneId };
	}, [ctx.workspaceId, activeTabIds, focusedPaneIds]);

	const actions = useMemo<Record<string, ActionHandler>>(() => {
		const handlers: Record<string, ActionHandler> = {
			// Workspace actions
			"close-workspace": async () => {
				if (!ctx.workspaceId) return;
				closeMenu();
				try {
					await closeWorkspace.mutateAsync({ id: ctx.workspaceId });
					navigate({ to: "/" });
				} catch (err) {
					toast.error(
						err instanceof Error ? err.message : "Failed to close workspace",
					);
				}
			},
			"workspace-settings": () => {
				if (!ctx.projectId) return;
				closeMenu();
				navigate({
					to: "/settings/project/$projectId",
					params: { projectId: ctx.projectId },
				});
			},
			"new-terminal-tab": () => {
				if (!ctx.workspaceId) return;
				closeMenu();
				addTab(ctx.workspaceId);
			},
			"split-pane-right": () => {
				const { tabId, paneId } = getActiveTabAndPane();
				if (!tabId || !paneId) return;
				closeMenu();
				splitPaneVertical(tabId, paneId);
			},
			"split-pane-down": () => {
				const { tabId, paneId } = getActiveTabAndPane();
				if (!tabId || !paneId) return;
				closeMenu();
				splitPaneHorizontal(tabId, paneId);
			},
			"clear-terminal": () => {
				// Clear terminal is handled by the terminal component's hotkey handler
				// We dispatch the keyboard event to trigger it
				closeMenu();
				// Note: This won't work directly - clear terminal needs direct terminal access
				// Users should use the keyboard shortcut instead
				toast.info("Use keyboard shortcut to clear terminal");
			},

			// Global actions
			"new-workspace": () => {
				closeMenu();
				openNewWorkspaceModal(ctx.projectId ?? undefined);
			},
			"quick-create-workspace": () => {
				closeMenu();
				// Quick create just opens the modal pre-filled
				openNewWorkspaceModal(ctx.projectId ?? undefined);
			},
			"open-project": async () => {
				closeMenu();
				try {
					const result = await openNew.mutateAsync(undefined);
					if (result.canceled) return;
					if ("error" in result) {
						toast.error("Failed to open project", {
							description: result.error,
						});
						return;
					}
					if ("needsGitInit" in result) {
						toast.error("Selected folder is not a git repository");
						return;
					}
					toast.success("Project opened", { description: result.project.name });
				} catch (err) {
					toast.error(
						err instanceof Error ? err.message : "Failed to open project",
					);
				}
			},
			"change-theme": () => {
				closeMenu();
				// Toggle between dark and light, or toggle from system
				if (themeId === "dark") {
					setTheme("light");
				} else if (themeId === "light") {
					setTheme("dark");
				} else {
					// If using system or custom theme, toggle based on current appearance
					setTheme(themeId === SYSTEM_THEME_ID ? "dark" : "light");
				}
			},
			"toggle-workspace-sidebar": () => {
				closeMenu();
				if (!isWorkspaceSidebarOpen) {
					setWorkspaceSidebarOpen(true);
				} else {
					toggleWorkspaceSidebarCollapsed();
				}
			},

			// Navigation
			"settings-appearance": () => {
				closeMenu();
				navigate({ to: "/settings/appearance" });
			},
			"settings-keyboard": () => {
				closeMenu();
				navigate({ to: "/settings/keyboard" });
			},
			"settings-terminal": () => {
				closeMenu();
				navigate({ to: "/settings/terminal" });
			},
			"settings-integrations": () => {
				closeMenu();
				navigate({ to: "/settings/integrations" });
			},
			"contact-us": () => {
				closeMenu();
				window.open(COMPANY.MAIL_TO, "_blank");
			},
			"join-discord": () => {
				closeMenu();
				window.open(COMPANY.DISCORD_URL, "_blank");
			},
			"check-updates": () => {
				closeMenu();
				checkForUpdates.mutate();
				toast.info("Checking for updates...");
			},
		};

		return handlers;
	}, [
		ctx.workspaceId,
		ctx.projectId,
		closeMenu,
		closeWorkspace,
		navigate,
		openNewWorkspaceModal,
		openNew,
		addTab,
		splitPaneVertical,
		splitPaneHorizontal,
		getActiveTabAndPane,
		themeId,
		setTheme,
		isWorkspaceSidebarOpen,
		setWorkspaceSidebarOpen,
		toggleWorkspaceSidebarCollapsed,
		checkForUpdates,
	]);

	// Handle workspace switching
	const handleWorkspaceSwitch = useCallback(
		(workspaceId: string) => {
			closeMenu();
			navigate({ to: "/workspace/$workspaceId", params: { workspaceId } });
		},
		[closeMenu, navigate],
	);

	const executeCommand = useCallback(
		(commandId: string) => {
			// Check if it's a workspace switch command
			if (commandId.startsWith("switch-workspace-")) {
				const workspaceId = commandId.replace("switch-workspace-", "");
				handleWorkspaceSwitch(workspaceId);
				return;
			}

			const handler = actions[commandId];
			if (handler) {
				handler();
			}
		},
		[actions, handleWorkspaceSwitch],
	);

	return { executeCommand };
}
