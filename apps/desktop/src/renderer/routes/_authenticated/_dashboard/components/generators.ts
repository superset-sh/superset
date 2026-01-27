import type { HotkeyId } from "shared/hotkeys";
import type {
	CommandContext,
	CommandGroup,
	CommandGroupGenerator,
} from "./types";

export interface WorkspaceItem {
	id: string;
	name: string;
	branch: string;
}

const WORKSPACE_HOTKEY_IDS: HotkeyId[] = [
	"JUMP_TO_WORKSPACE_1",
	"JUMP_TO_WORKSPACE_2",
	"JUMP_TO_WORKSPACE_3",
	"JUMP_TO_WORKSPACE_4",
	"JUMP_TO_WORKSPACE_5",
	"JUMP_TO_WORKSPACE_6",
	"JUMP_TO_WORKSPACE_7",
	"JUMP_TO_WORKSPACE_8",
	"JUMP_TO_WORKSPACE_9",
];

// Only shown when in a workspace
export const contextualCommands: CommandGroupGenerator = (ctx) => {
	if (!ctx.isInWorkspace) return null;

	return {
		displayName: "Workspace Actions",
		commands: [
			{
				id: "close-workspace",
				label: `Close ${ctx.workspaceName || "Workspace"}`,
			},
			{
				id: "workspace-settings",
				label: `${ctx.workspaceName || "Workspace"} Settings`,
			},
			{
				id: "new-terminal-tab",
				label: "New Terminal Tab",
				hotkeyId: "NEW_GROUP",
			},
			{
				id: "split-pane-right",
				label: "Split Pane Right",
				hotkeyId: "SPLIT_RIGHT",
			},
			{
				id: "split-pane-down",
				label: "Split Pane Down",
				hotkeyId: "SPLIT_DOWN",
			},
			{
				id: "clear-terminal",
				label: "Clear Terminal",
				hotkeyId: "CLEAR_TERMINAL",
			},
		],
	};
};

// Dynamic workspace list (requires workspace data)
export const workspacesCommands = (
	_ctx: CommandContext,
	workspaces: WorkspaceItem[],
): CommandGroup | null => {
	if (workspaces.length === 0) return null;

	return {
		displayName: "Workspaces",
		commands: workspaces.map((ws, index) => ({
			id: `switch-workspace-${ws.id}`,
			label: ws.name || ws.branch,
			keywords: [ws.branch, ws.name].filter(Boolean),
			hotkeyId: index < 9 ? WORKSPACE_HOTKEY_IDS[index] : undefined,
		})),
	};
};

// Always shown
export const actionsCommands: CommandGroupGenerator = () => ({
	displayName: "Actions",
	commands: [
		{ id: "new-workspace", label: "New Workspace", hotkeyId: "NEW_WORKSPACE" },
		{
			id: "quick-create-workspace",
			label: "Quick Create Workspace",
			hotkeyId: "QUICK_CREATE_WORKSPACE",
		},
		{
			id: "open-project",
			label: "Open Project",
			keywords: ["folder", "repo"],
			hotkeyId: "OPEN_PROJECT",
		},
		{
			id: "change-theme",
			label: "Change Theme",
			keywords: ["dark", "light", "mode", "toggle"],
		},
		{
			id: "toggle-workspace-sidebar",
			label: "Toggle Sidebar",
			hotkeyId: "TOGGLE_WORKSPACE_SIDEBAR",
		},
	],
});

// Always shown
export const navigationCommands: CommandGroupGenerator = () => ({
	displayName: "Navigation",
	commands: [
		{
			id: "settings-appearance",
			label: "Appearance Settings",
			keywords: ["theme"],
		},
		{
			id: "settings-keyboard",
			label: "Keyboard Shortcuts",
			hotkeyId: "SHOW_HOTKEYS",
		},
		{
			id: "settings-terminal",
			label: "Terminal Settings",
			keywords: ["shell", "presets"],
		},
		{
			id: "settings-integrations",
			label: "Integrations",
			keywords: ["github"],
		},
		{
			id: "contact-us",
			label: "Contact Us",
			keywords: ["support", "feedback"],
		},
		{
			id: "join-discord",
			label: "Join Discord",
			keywords: ["community"],
		},
		{
			id: "check-updates",
			label: "Check for Updates",
		},
	],
});
