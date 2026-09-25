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

const SUBSCRIBERS_PER_WINDOW = 5;
const WINDOW_CEILING = 20;

export const menuEmitter = new EventEmitter();
menuEmitter.setMaxListeners(SUBSCRIBERS_PER_WINDOW * WINDOW_CEILING);
