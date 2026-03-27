import "@sentry/electron/preload";

import { contextBridge, ipcRenderer, webUtils } from "electron";
import {
	DESKTOP_TEST_AUTOMATION_CHANNEL,
	type DesktopTestAutomationCommand,
} from "lib/electron-app/test-automation-ipc";
import { exposeElectronTRPC } from "trpc-electron/main";
import { IS_DESKTOP_TEST_MODE } from "../lib/electron-app/test-mode";

declare const __APP_VERSION__: string;

declare global {
	interface Window {
		App: typeof API;
		ipcRenderer: typeof ipcRendererAPI;
		webUtils: {
			getPathForFile: (file: File) => string;
		};
	}
}

// Expose electron-trpc IPC channel before any renderer client initializes.
exposeElectronTRPC();

const automationAPI = {
	ping: () =>
		invokeDesktopTestAutomation({
			type: "ping",
		}) as Promise<{
			ok: boolean;
			testMode: boolean;
			pid: number;
			appVersion: string;
		}>,
	getEnvironment: () =>
		invokeDesktopTestAutomation({
			type: "getEnvironment",
		}) as Promise<{
			testMode: boolean;
			nodeEnv: string;
			supersetHomeDir: string;
			artifactsDir: string | null;
		}>,
	getWindowInfo: () =>
		invokeDesktopTestAutomation({
			type: "getWindowInfo",
		}) as Promise<{
			title: string;
			url: string;
			isFocused: boolean;
			isVisible: boolean;
			bounds: {
				x: number;
				y: number;
				width: number;
				height: number;
			};
		} | null>,
	getAuthState: () =>
		invokeDesktopTestAutomation({
			type: "getAuthState",
		}) as Promise<{
			tokenPresent: boolean;
			expiresAt: string | null;
		}>,
	getStoredAuthToken: () =>
		invokeDesktopTestAutomation({
			type: "getStoredAuthToken",
		}) as Promise<{
			token: string | null;
			expiresAt: string | null;
		}>,
	seedAuthToken: (input: { token: string; expiresAt: string }) =>
		invokeDesktopTestAutomation({
			type: "seedAuthToken",
			token: input.token,
			expiresAt: input.expiresAt,
		}) as Promise<{
			tokenPresent: boolean;
			expiresAt: string | null;
		}>,
	clearAuthToken: () =>
		invokeDesktopTestAutomation({
			type: "clearAuthToken",
		}) as Promise<{
			tokenPresent: boolean;
			expiresAt: string | null;
		}>,
};

const API = {
	sayHelloFromBridge: () => console.log("\nHello from bridgeAPI! 👋\n\n"),
	username: process.env.USER,
	appVersion: __APP_VERSION__,
	testMode: IS_DESKTOP_TEST_MODE,
	automation: automationAPI,
};

function invokeDesktopTestAutomation(command: DesktopTestAutomationCommand) {
	return ipcRenderer.invoke(DESKTOP_TEST_AUTOMATION_CHANNEL, command);
}

// Store mapping of user listeners to wrapped listeners for proper cleanup
type IpcListener = (...args: unknown[]) => void;
const listenerMap = new WeakMap<IpcListener, IpcListener>();

/**
 * IPC renderer API
 * Note: Primary IPC communication uses tRPC. This API is for low-level IPC needs.
 */
const ipcRendererAPI = {
	// biome-ignore lint/suspicious/noExplicitAny: IPC invoke requires any for dynamic channel types
	invoke: (channel: string, ...args: any[]) =>
		ipcRenderer.invoke(channel, ...args),

	// biome-ignore lint/suspicious/noExplicitAny: IPC send requires any for dynamic channel types
	send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),

	// biome-ignore lint/suspicious/noExplicitAny: IPC listener requires any for dynamic event types
	on: (channel: string, listener: (...args: any[]) => void) => {
		// biome-ignore lint/suspicious/noExplicitAny: IPC event wrapper requires any
		const wrappedListener = (_event: any, ...args: any[]) => {
			listener(...args);
		};
		listenerMap.set(listener, wrappedListener);
		ipcRenderer.on(channel, wrappedListener);
	},

	// biome-ignore lint/suspicious/noExplicitAny: IPC listener requires any for dynamic event types
	off: (channel: string, listener: (...args: any[]) => void) => {
		const wrappedListener = listenerMap.get(listener as IpcListener);
		if (wrappedListener) {
			// biome-ignore lint/suspicious/noExplicitAny: Electron IPC API requires this cast
			ipcRenderer.removeListener(channel, wrappedListener as any);
			listenerMap.delete(listener as IpcListener);
		}
	},
};

contextBridge.exposeInMainWorld("App", API);
contextBridge.exposeInMainWorld("ipcRenderer", ipcRendererAPI);
contextBridge.exposeInMainWorld("webUtils", {
	getPathForFile: (file: File) => webUtils.getPathForFile(file),
});
