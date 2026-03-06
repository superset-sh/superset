import type { BrowserWindow } from "electron";

interface WindowIpcHandler {
	attachWindow: (win: BrowserWindow) => void;
	detachWindow: (win: BrowserWindow, webContentsId?: number) => void;
}

let ipcHandler: WindowIpcHandler | null = null;

export function getIpcHandler(): WindowIpcHandler | null {
	return ipcHandler;
}

export function setIpcHandler(handler: WindowIpcHandler): void {
	ipcHandler = handler;
}

export function attachWindowToIpcHandler(win: BrowserWindow): void {
	ipcHandler?.attachWindow(win);
}

export function detachWindowFromIpcHandler(win: BrowserWindow): void {
	ipcHandler?.detachWindow(win);
}
