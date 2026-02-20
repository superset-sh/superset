import { app, BrowserWindow } from "electron";
import { PLATFORM } from "shared/constants";

let _isTrayOnlyMode = false;
let _skipQuitConfirmation = false;

export function getSkipQuitConfirmation(): boolean {
	return _skipQuitConfirmation;
}

export function setSkipQuitConfirmation(): void {
	_skipQuitConfirmation = true;
}

export function getIsTrayOnlyMode(): boolean {
	return _isTrayOnlyMode;
}

export function enterTrayOnlyMode(): void {
	if (_isTrayOnlyMode) return;
	console.log("[tray-only] Entering tray-only mode");
	_isTrayOnlyMode = true;

	for (const window of BrowserWindow.getAllWindows()) {
		window.close();
	}

	if (PLATFORM.IS_MAC) {
		app.dock?.hide();
	}
}

export function exitTrayOnlyMode(): void {
	if (!_isTrayOnlyMode) return;
	console.log("[tray-only] Exiting tray-only mode");
	_isTrayOnlyMode = false;

	if (PLATFORM.IS_MAC) {
		app.dock?.show();
	}
}
