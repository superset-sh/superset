import { EventEmitter } from "node:events";
export type SettingsSection =
	| "project"
	| "workspace"
	| "appearance"
	| "keyboard"
	| "behavior"
	| "git"
	| "terminal"
	| "integrations";

export interface OpenSettingsEvent {
	section?: SettingsSection;
}

export interface OpenWorkspaceEvent {
	workspaceId: string;
}

export const menuEmitter = new EventEmitter();
// Five renderer subscriptions per window (layouts, file menu, command palette,
// content view) — three windows already pass Node's default warning threshold.
menuEmitter.setMaxListeners(100);
