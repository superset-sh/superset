import "@sentry/electron/preload";

import { contextBridge, ipcRenderer, webUtils } from "electron";
import { exposeElectronTRPC } from "trpc-electron/main";

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

const API = {
	sayHelloFromBridge: () => console.log("\nHello from bridgeAPI! 👋\n\n"),
	username: process.env.USER,
	appVersion: __APP_VERSION__,
	platform: process.platform,
};

// Store mapping of user listeners to wrapped listeners for proper cleanup
type IpcListener = (...args: unknown[]) => void;
const listenerMap = new WeakMap<IpcListener, IpcListener>();

// Channel allowlist: this bridge is reachable by any JS in the renderer
// (including future third-party plugin code), so every channel must be
// explicitly listed here. electron-trpc has its own channel via
// exposeElectronTRPC() and is not routed through this API.
const ALLOWED_INVOKE_CHANNELS = new Set<string>();
const ALLOWED_SEND_CHANNELS = new Set<string>();
const ALLOWED_LISTEN_CHANNELS = new Set<string>(["deep-link-navigate"]);

const assertAllowedChannel = (
	allowed: Set<string>,
	method: string,
	channel: string,
) => {
	if (!allowed.has(channel)) {
		throw new Error(`Blocked ipcRenderer.${method} on channel "${channel}"`);
	}
};

/**
 * IPC renderer API
 * Note: Primary IPC communication uses tRPC. This API is for low-level IPC needs.
 */
const ipcRendererAPI = {
	// biome-ignore lint/suspicious/noExplicitAny: IPC invoke requires any for dynamic channel types
	invoke: (channel: string, ...args: any[]) => {
		assertAllowedChannel(ALLOWED_INVOKE_CHANNELS, "invoke", channel);
		return ipcRenderer.invoke(channel, ...args);
	},

	// biome-ignore lint/suspicious/noExplicitAny: IPC send requires any for dynamic channel types
	send: (channel: string, ...args: any[]) => {
		assertAllowedChannel(ALLOWED_SEND_CHANNELS, "send", channel);
		ipcRenderer.send(channel, ...args);
	},

	// biome-ignore lint/suspicious/noExplicitAny: IPC listener requires any for dynamic event types
	on: (channel: string, listener: (...args: any[]) => void) => {
		if (!ALLOWED_LISTEN_CHANNELS.has(channel)) {
			console.error(`Blocked ipcRenderer.on for channel "${channel}"`);
			return;
		}
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

// Expose electron-trpc IPC channel FIRST (must be before contextBridge calls)
exposeElectronTRPC();

contextBridge.exposeInMainWorld("App", API);
contextBridge.exposeInMainWorld("ipcRenderer", ipcRendererAPI);
contextBridge.exposeInMainWorld("webUtils", {
	getPathForFile: (file: File) => webUtils.getPathForFile(file),
});
