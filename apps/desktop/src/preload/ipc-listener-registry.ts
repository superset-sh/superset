/**
 * Bookkeeping for the low-level `window.ipcRenderer.on/off` bridge.
 *
 * Each user listener is wrapped so the raw Electron `event` argument is
 * stripped before the user callback runs. To support removal we must remember
 * which wrapped function corresponds to a given (channel, user listener) pair.
 *
 * The pairing MUST be keyed by channel as well as by the listener: the same
 * user function can legitimately be registered on multiple channels, and if the
 * bookkeeping is keyed by listener alone, registering it on a second channel
 * overwrites the first channel's entry. `off()` then removes the wrong wrapped
 * listener (a no-op on the intended channel), leaking the real one for the
 * lifetime of the renderer — every leaked wrapper pins a persistent V8 handle
 * to the closure, which over long uptimes drives continuous cppgc churn.
 */

// biome-ignore lint/suspicious/noExplicitAny: IPC listeners are dynamically typed
export type IpcListener = (...args: any[]) => void;
// biome-ignore lint/suspicious/noExplicitAny: matches Electron's ipcRenderer event listener shape
type WrappedIpcListener = (event: any, ...args: any[]) => void;

export interface IpcRendererLike {
	on(channel: string, listener: WrappedIpcListener): void;
	removeListener(channel: string, listener: WrappedIpcListener): void;
}

export function createIpcListenerRegistry(ipcRenderer: IpcRendererLike) {
	// One WeakMap per channel so the same listener can be tracked independently
	// across channels while still allowing the wrapped closures to be collected
	// once the user drops their reference to the original listener.
	const channelListeners = new Map<
		string,
		WeakMap<IpcListener, WrappedIpcListener>
	>();

	const getChannelMap = (channel: string) => {
		let map = channelListeners.get(channel);
		if (!map) {
			map = new WeakMap<IpcListener, WrappedIpcListener>();
			channelListeners.set(channel, map);
		}
		return map;
	};

	return {
		on(channel: string, listener: IpcListener) {
			const wrappedListener: WrappedIpcListener = (_event, ...args) => {
				listener(...args);
			};
			getChannelMap(channel).set(listener, wrappedListener);
			ipcRenderer.on(channel, wrappedListener);
		},

		off(channel: string, listener: IpcListener) {
			const map = channelListeners.get(channel);
			const wrappedListener = map?.get(listener);
			if (map && wrappedListener) {
				ipcRenderer.removeListener(channel, wrappedListener);
				map.delete(listener);
			}
		},
	};
}
