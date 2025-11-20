/**
 * Arc-style keyboard shortcuts for Superset
 */

import type {
	KeyboardShortcut,
	KeyboardShortcutGroup,
} from "./keyboard-shortcuts";

export interface ShortcutHandlers {
	// Workspace management
	switchToPrevWorkspace: () => void;
	switchToNextWorkspace: () => void;
	toggleSidebar: () => void;
	splitHorizontal: () => void; // iTerm2: Cmd+Shift+D
	splitVertical: () => void; // iTerm2: Cmd+D

	// Tab management
	switchToPrevTab: () => void;
	switchToNextTab: () => void;
	newTab: () => void;
	closeTab: () => void;
	reopenClosedTab: () => void;
	jumpToTab: (index: number) => void;

	// Split pane navigation (iTerm2 style)
	focusPaneLeft: () => void;
	focusPaneRight: () => void;
	focusPaneUp: () => void;
	focusPaneDown: () => void;

	// Terminal specific
	clearTerminal: () => void;
	closeTerminal: () => void;
}

export function createWorkspaceShortcuts(
	handlers: Pick<
		ShortcutHandlers,
		| "switchToPrevWorkspace"
		| "switchToNextWorkspace"
		| "toggleSidebar"
		| "splitVertical"
		| "splitHorizontal"
	>,
): KeyboardShortcutGroup {
	return {
		name: "Workspace Management",
		shortcuts: [
			{
				key: "ArrowLeft",
				modifiers: ["meta", "alt"],
				description: "Switch to previous workspace",
				handler: (event) => {
					event.preventDefault();
					handlers.switchToPrevWorkspace();
					return false;
				},
			},
			{
				key: "ArrowRight",
				modifiers: ["meta", "alt"],
				description: "Switch to next workspace",
				handler: (event) => {
					event.preventDefault();
					handlers.switchToNextWorkspace();
					return false;
				},
			},
			{
				key: "s",
				modifiers: ["meta"],
				description: "Toggle sidebar visibility",
				handler: (event) => {
					event.preventDefault();
					handlers.toggleSidebar();
					return false;
				},
			},
			{
				key: "d",
				modifiers: ["meta"],
				description: "Split window vertically (iTerm2 style)",
				handler: (event) => {
					event.preventDefault();
					handlers.splitVertical();
					return false;
				},
			},
			{
				key: "d",
				modifiers: ["meta", "shift"],
				description: "Split window horizontally (iTerm2 style)",
				handler: (event) => {
					event.preventDefault();
					handlers.splitHorizontal();
					return false;
				},
			},
		],
	};
}

export function createTabShortcuts(
	handlers: Pick<
		ShortcutHandlers,
		| "switchToPrevTab"
		| "switchToNextTab"
		| "newTab"
		| "closeTab"
		| "reopenClosedTab"
		| "jumpToTab"
	>,
): KeyboardShortcutGroup {
	const shortcuts: KeyboardShortcut[] = [
		{
			key: "ArrowUp",
			modifiers: ["meta", "alt"],
			description: "Switch to previous tab",
			handler: (event) => {
				event.preventDefault();
				handlers.switchToPrevTab();
				return false;
			},
		},
		{
			key: "ArrowDown",
			modifiers: ["meta", "alt"],
			description: "Switch to next tab",
			handler: (event) => {
				event.preventDefault();
				handlers.switchToNextTab();
				return false;
			},
		},
		{
			key: "t",
			modifiers: ["meta"],
			description: "Create new tab",
			handler: (event) => {
				event.preventDefault();
				handlers.newTab();
				return false;
			},
		},
		{
			key: "w",
			modifiers: ["meta"],
			description: "Close current tab",
			handler: (event) => {
				event.preventDefault();
				handlers.closeTab();
				return false;
			},
		},
		{
			key: "t",
			modifiers: ["meta", "shift"],
			description: "Reopen closed tab",
			handler: (event) => {
				event.preventDefault();
				handlers.reopenClosedTab();
				return false;
			},
		},
	];

	// Add Cmd+1-9 shortcuts for jumping to tabs
	for (let i = 1; i <= 9; i++) {
		shortcuts.push({
			key: i.toString(),
			modifiers: ["meta"],
			description: `Jump to tab ${i}`,
			handler: (event) => {
				event.preventDefault();
				handlers.jumpToTab(i);
				return false;
			},
		});
	}

	return {
		name: "Tab Management",
		shortcuts,
	};
}

export function createSplitPaneShortcuts(
	handlers: Pick<
		ShortcutHandlers,
		"focusPaneLeft" | "focusPaneRight" | "focusPaneUp" | "focusPaneDown"
	>,
): KeyboardShortcutGroup {
	return {
		name: "Split Pane Navigation",
		shortcuts: [
			{
				key: "ArrowLeft",
				modifiers: ["meta", "alt"],
				description: "Focus left pane",
				handler: (event) => {
					event.preventDefault();
					handlers.focusPaneLeft();
					return false;
				},
			},
			{
				key: "ArrowRight",
				modifiers: ["meta", "alt"],
				description: "Focus right pane",
				handler: (event) => {
					event.preventDefault();
					handlers.focusPaneRight();
					return false;
				},
			},
			{
				key: "ArrowUp",
				modifiers: ["meta", "alt"],
				description: "Focus upper pane",
				handler: (event) => {
					event.preventDefault();
					handlers.focusPaneUp();
					return false;
				},
			},
			{
				key: "ArrowDown",
				modifiers: ["meta", "alt"],
				description: "Focus lower pane",
				handler: (event) => {
					event.preventDefault();
					handlers.focusPaneDown();
					return false;
				},
			},
		],
	};
}

export function createTerminalShortcuts(
	handlers: Pick<ShortcutHandlers, "clearTerminal" | "closeTerminal">,
): KeyboardShortcutGroup {
	return {
		name: "Terminal",
		shortcuts: [
			{
				key: "k",
				modifiers: ["meta"],
				description: "Clear terminal (scrollback + screen)",
				handler: (event) => {
					event.preventDefault();
					handlers.clearTerminal();
					return false;
				},
			},
			{
				key: "w",
				modifiers: ["meta"],
				description: "Close current terminal",
				handler: (event) => {
					event.preventDefault();
					handlers.closeTerminal();
					return false;
				},
			},
		],
	};
}
