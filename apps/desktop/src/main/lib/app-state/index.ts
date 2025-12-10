import { JSONFilePreset } from "lowdb/node";
import { APP_STATE_PATH } from "../app-environment";
import type { AppState } from "./schemas";
import { defaultAppState } from "./schemas";

type AppStateDB = Awaited<ReturnType<typeof JSONFilePreset<AppState>>>;

let _appState: AppStateDB | null = null;

export async function initAppState(): Promise<void> {
	if (_appState) return;

	_appState = await JSONFilePreset<AppState>(APP_STATE_PATH, defaultAppState);
	console.log(`App state initialized at: ${APP_STATE_PATH}`);
}

export const appState = new Proxy({} as AppStateDB, {
	get(_target, prop) {
		if (!_appState) {
			throw new Error("App state not initialized. Call initAppState() first.");
		}
		return _appState[prop as keyof AppStateDB];
	},
});
