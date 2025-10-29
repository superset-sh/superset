import { contextBridge, ipcRenderer } from "electron";
import type {
	IpcChannelName,
	IpcRequest,
	IpcResponse_,
} from "shared/ipc-channels";
import type { ConfigSchema } from "shared/electron-store";

declare global {
	interface Window {
		App: typeof API;
		ipcRenderer: typeof ipcRendererAPI;
		electronAPI: typeof electronAPI;
	}
}

const API = {
	sayHelloFromBridge: () => console.log("\nHello from bridgeAPI! 👋\n\n"),
	username: process.env.USER,
};

// Store mapping of user listeners to wrapped listeners for proper cleanup
const listenerMap = new WeakMap<Function, Function>();

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
	invokeUntyped: (channel: string, ...args: any[]) =>
		ipcRenderer.invoke(channel, ...args),

	send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),

	on: (channel: string, listener: (...args: any[]) => void) => {
		const wrappedListener = (_event: any, ...args: any[]) => {
			listener(...args);
		};
		listenerMap.set(listener, wrappedListener);
		ipcRenderer.on(channel, wrappedListener);
	},

	off: (channel: string, listener: (...args: any[]) => void) => {
		const wrappedListener = listenerMap.get(listener);
		if (wrappedListener) {
			ipcRenderer.removeListener(channel, wrappedListener as any);
			listenerMap.delete(listener);
		}
	},
};

/**
 * High-level API for config operations
 */
const electronAPI = {
	config: {
		/**
		 * Get entire config state from main process
		 * @returns Promise resolving to full config (workspaces, lastWorkspaceId, tabGroupTemplates)
		 */
		get: (): Promise<ConfigSchema> => {
			return ipcRenderer.invoke("config:get");
		},

		/**
		 * Set config state in main process (merges with existing state)
		 * @param data - Partial or full config object to save
		 * @returns Promise resolving to updated config state
		 */
		set: (data: Partial<ConfigSchema>): Promise<ConfigSchema> => {
			return ipcRenderer.invoke("config:set", data);
		},
	},
};

contextBridge.exposeInMainWorld("App", API);
contextBridge.exposeInMainWorld("ipcRenderer", ipcRendererAPI);
contextBridge.exposeInMainWorld("electronAPI", electronAPI);
