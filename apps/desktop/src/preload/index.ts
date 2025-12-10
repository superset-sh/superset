import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
	IpcChannelName,
	IpcRequest,
	IpcResponse_,
} from "shared/ipc-channels";
import { exposeElectronTRPC } from "trpc-electron/main";

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
};

// Store mapping of user listeners to wrapped listeners for proper cleanup
type IpcListener = (...args: unknown[]) => void;
const listenerMap = new WeakMap<IpcListener, IpcListener>();

/**
 * Type-safe IPC renderer API
 */
const ipcRendererAPI = {
	/**
	 * Type-safe invoke method for IPC calls
	 * @example
	 * const workspace = await window.ipcRenderer.invoke("workspace-get", workspaceId);
	 */
	invoke: <T extends IpcChannelName>(
		channel: T,
		...args: IpcRequest<T> extends void ? [] : [IpcRequest<T>]
	): Promise<IpcResponse_<T>> => {
		return ipcRenderer.invoke(channel, ...args);
	},

	/**
	 * Legacy untyped invoke for backwards compatibility
	 * @deprecated Use typed invoke instead
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Legacy API requires any for backwards compatibility
	invokeUntyped: (channel: string, ...args: any[]) =>
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

// Expose electron-trpc IPC channel FIRST (must be before contextBridge calls)
exposeElectronTRPC();

contextBridge.exposeInMainWorld("App", API);
contextBridge.exposeInMainWorld("ipcRenderer", ipcRendererAPI);
contextBridge.exposeInMainWorld("webUtils", {
	getPathForFile: (file: File) => webUtils.getPathForFile(file),
});
