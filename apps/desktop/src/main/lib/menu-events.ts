import { EventEmitter } from "node:events";

export type SettingsSection =
	| "project"
	| "workspace"
	| "appearance"
	| "keyboard";

export interface OpenSettingsEvent {
	section?: SettingsSection;
}

export const menuEmitter = new EventEmitter();
