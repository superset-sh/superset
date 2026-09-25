import { useCallback, useSyncExternalStore } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { DEFAULT_DEVICE_PRESET, DEVICE_PRESETS } from "./constants";

export interface DeviceToolbarState {
	isOpen: boolean;
	deviceId: string;
	isRotated: boolean;
}

const IDLE_STATE: DeviceToolbarState = Object.freeze({
	isOpen: false,
	deviceId: DEFAULT_DEVICE_PRESET.id,
	isRotated: false,
});

/**
 * Per-pane "device toolbar" (Chrome's responsive-viewport emulation). Lives
 * outside React for the same reason as designModeStore/findBarStore: the
 * toolbar's menu toggle and the pane body's control strip + emulation side
 * effect are separate component trees sharing one piece of state.
 */
class DeviceToolbarStoreImpl {
	private states = new Map<string, DeviceToolbarState>();
	private listeners = new Map<string, Set<() => void>>();

	getState(paneId: string): DeviceToolbarState {
		return this.states.get(paneId) ?? IDLE_STATE;
	}

	subscribe(paneId: string, listener: () => void): () => void {
		let set = this.listeners.get(paneId);
		if (!set) {
			set = new Set();
			this.listeners.set(paneId, set);
		}
		set.add(listener);
		return () => {
			set.delete(listener);
		};
	}

	private setState(paneId: string, state: DeviceToolbarState): void {
		if (!state.isOpen) {
			this.states.delete(paneId);
		} else {
			this.states.set(paneId, state);
		}
		const listeners = this.listeners.get(paneId);
		if (listeners) for (const listener of listeners) listener();
		this.syncEmulation(paneId, state);
	}

	private syncEmulation(paneId: string, state: DeviceToolbarState): void {
		if (!state.isOpen) {
			electronTrpcClient.browser.setDeviceEmulation
				.mutate({ paneId, params: null })
				.catch(() => {});
			return;
		}
		const device =
			DEVICE_PRESETS.find((d) => d.id === state.deviceId) ??
			DEFAULT_DEVICE_PRESET;
		const params = state.isRotated
			? { width: device.height, height: device.width }
			: { width: device.width, height: device.height };
		electronTrpcClient.browser.setDeviceEmulation
			.mutate({ paneId, params })
			.catch(() => {});
	}

	toggle(paneId: string): void {
		const current = this.getState(paneId);
		this.setState(paneId, { ...current, isOpen: !current.isOpen });
	}

	close(paneId: string): void {
		const current = this.getState(paneId);
		if (!current.isOpen) return;
		this.setState(paneId, { ...current, isOpen: false });
	}

	setDevice(paneId: string, deviceId: string): void {
		this.setState(paneId, { ...this.getState(paneId), deviceId });
	}

	toggleRotate(paneId: string): void {
		const current = this.getState(paneId);
		this.setState(paneId, { ...current, isRotated: !current.isRotated });
	}

	/** Pane is closing/unmounting — drop state without re-emitting to listeners
	 *  that are torn down anyway, but still clear the main-process emulation. */
	reset(paneId: string): void {
		const wasOpen = this.getState(paneId).isOpen;
		this.states.delete(paneId);
		this.listeners.delete(paneId);
		if (wasOpen) {
			electronTrpcClient.browser.setDeviceEmulation
				.mutate({ paneId, params: null })
				.catch(() => {});
		}
	}
}

export const deviceToolbarStore = new DeviceToolbarStoreImpl();

export function useDeviceToolbarState(paneId: string): DeviceToolbarState {
	return useSyncExternalStore(
		useCallback((cb) => deviceToolbarStore.subscribe(paneId, cb), [paneId]),
		useCallback(() => deviceToolbarStore.getState(paneId), [paneId]),
	);
}
