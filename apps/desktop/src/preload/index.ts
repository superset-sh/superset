import { contextBridge, ipcRenderer } from "electron";
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
		electronStore: {
			get: (key: string) => any;
			set: (key: string, value: any) => void;
			delete: (key: string) => void;
		};
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

// Expose electron-trpc IPC channel FIRST (must be before contextBridge calls)
exposeElectronTRPC();

// Expose electron-store API via IPC
const electronStoreAPI = {
	get: (key: string) => ipcRenderer.invoke("storage:get", { key }),
	set: (key: string, value: any) => ipcRenderer.invoke("storage:set", { key, value }),
	delete: (key: string) => ipcRenderer.invoke("storage:delete", { key }),
};

contextBridge.exposeInMainWorld("App", API);
contextBridge.exposeInMainWorld("ipcRenderer", ipcRendererAPI);
contextBridge.exposeInMainWorld("electronStore", electronStoreAPI);
