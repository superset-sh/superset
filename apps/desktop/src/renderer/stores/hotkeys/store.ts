import { useEffect, useMemo, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	setSkipNextHotkeysPersist,
	trpcHotkeysStorage,
} from "renderer/lib/trpc-storage";
import {
	canonicalizeHotkeyForPlatform,
	formatHotkeyDisplay,
	formatHotkeyText,
	getCurrentPlatform,
	getDefaultHotkey,
	getEffectiveHotkey,
	getEffectiveHotkeysMap,
	HOTKEYS,
	HOTKEYS_STATE_VERSION,
	type HotkeyCategory,
	type HotkeyDefinition,
	type HotkeyId,
	type HotkeyPlatform,
	type HotkeysState,
	hotkeyFromKeyboardEvent,
	isValidAppHotkey,
	matchesHotkeyEvent,
} from "shared/hotkeys";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface HotkeysStoreState {
	hotkeysState: HotkeysState;
	platform: HotkeyPlatform;
	setHotkey: (id: HotkeyId, keys: string | null) => void;
	setHotkeysBatch: (updates: Partial<Record<HotkeyId, string | null>>) => void;
	resetHotkey: (id: HotkeyId) => void;
	resetAllHotkeys: () => void;
	replaceHotkeysState: (state: HotkeysState) => void;
}

const DEFAULT_STATE: HotkeysState = {
	version: HOTKEYS_STATE_VERSION,
	byPlatform: { darwin: {}, win32: {}, linux: {} },
};

function getOverridesForPlatform(
	state: HotkeysState,
	platform: HotkeyPlatform,
): Record<HotkeyId, string | null> {
	return (state.byPlatform[platform] ?? {}) as Record<HotkeyId, string | null>;
}

function updateOverrides(
	state: HotkeysState,
	platform: HotkeyPlatform,
	next: Partial<Record<HotkeyId, string | null>>,
): HotkeysState {
	return {
		...state,
		byPlatform: {
			...state.byPlatform,
			[platform]: next,
		},
	};
}

export const useHotkeysStore = create<HotkeysStoreState>()(
	devtools(
		persist(
			(set, get) => ({
				hotkeysState: DEFAULT_STATE,
				platform: getCurrentPlatform(),

				setHotkey: (id, keys) => {
					const platform = get().platform;
					const canonical =
						keys === null
							? null
							: canonicalizeHotkeyForPlatform(keys, platform);
					if (keys !== null && !canonical) return;
					// App hotkeys must include ctrl or meta (or be function keys) to work in terminal
					if (canonical !== null && !isValidAppHotkey(canonical)) return;

					const defaultValue = getDefaultHotkey(id, platform);
					const overrides = getOverridesForPlatform(
						get().hotkeysState,
						platform,
					);
					const nextOverrides = { ...overrides };

					if (canonical === defaultValue) {
						delete nextOverrides[id];
					} else {
						nextOverrides[id] = canonical;
					}

					set((state) => ({
						hotkeysState: updateOverrides(
							state.hotkeysState,
							platform,
							nextOverrides,
						),
					}));
				},

				setHotkeysBatch: (updates) => {
					const platform = get().platform;
					const overrides = getOverridesForPlatform(
						get().hotkeysState,
						platform,
					);
					const nextOverrides = { ...overrides };

					for (const [id, keys] of Object.entries(updates)) {
						const hotkeyId = id as HotkeyId;
						const canonical =
							keys === null
								? null
								: canonicalizeHotkeyForPlatform(keys, platform);
						if (keys !== null && !canonical) continue;
						// App hotkeys must include ctrl or meta (or be function keys) to work in terminal
						if (canonical !== null && !isValidAppHotkey(canonical)) continue;
						const defaultValue = getDefaultHotkey(hotkeyId, platform);
						if (canonical === defaultValue) {
							delete nextOverrides[hotkeyId];
						} else {
							nextOverrides[hotkeyId] = canonical;
						}
					}

					set((state) => ({
						hotkeysState: updateOverrides(
							state.hotkeysState,
							platform,
							nextOverrides,
						),
					}));
				},

				resetHotkey: (id) => {
					const platform = get().platform;
					const overrides = getOverridesForPlatform(
						get().hotkeysState,
						platform,
					);
					if (!(id in overrides)) return;
					const nextOverrides = { ...overrides };
					delete nextOverrides[id];
					set((state) => ({
						hotkeysState: updateOverrides(
							state.hotkeysState,
							platform,
							nextOverrides,
						),
					}));
				},

				resetAllHotkeys: () => {
					const platform = get().platform;
					set((state) => ({
						hotkeysState: {
							...state.hotkeysState,
							byPlatform: {
								...state.hotkeysState.byPlatform,
								[platform]: {},
							},
						},
					}));
				},

				replaceHotkeysState: (state) => {
					set({ hotkeysState: state });
				},
			}),
			{
				name: "hotkeys-storage",
				storage: trpcHotkeysStorage,
				partialize: (state) => ({ hotkeysState: state.hotkeysState }),
			},
		),
		{ name: "HotkeysStore" },
	),
);

export function useHotkeyKeys(id: HotkeyId): string | null {
	return useHotkeysStore((state) => {
		const overrides = getOverridesForPlatform(
			state.hotkeysState,
			state.platform,
		);
		return getEffectiveHotkey(id, overrides, state.platform);
	});
}

export function getHotkeyKeys(id: HotkeyId): string | null {
	const state = useHotkeysStore.getState();
	const overrides = getOverridesForPlatform(state.hotkeysState, state.platform);
	return getEffectiveHotkey(id, overrides, state.platform);
}

export function useHotkeyDisplay(id: HotkeyId): string[] {
	const platform = useHotkeysStore((state) => state.platform);
	const keys = useHotkeyKeys(id);
	return useMemo(() => formatHotkeyDisplay(keys, platform), [keys, platform]);
}

export function useHotkeyText(id: HotkeyId): string {
	return useHotkeysStore((state) => {
		const overrides = getOverridesForPlatform(
			state.hotkeysState,
			state.platform,
		);
		const keys = getEffectiveHotkey(id, overrides, state.platform);
		return formatHotkeyText(keys, state.platform);
	});
}

export function useEffectiveHotkeysMap(): Record<HotkeyId, string | null> {
	const platform = useHotkeysStore((state) => state.platform);
	const hotkeysState = useHotkeysStore((state) => state.hotkeysState);
	return useMemo(() => {
		const overrides = getOverridesForPlatform(hotkeysState, platform);
		return getEffectiveHotkeysMap(overrides, platform);
	}, [hotkeysState, platform]);
}

export function useHotkeysByCategory(options?: {
	includeHidden?: boolean;
}): Record<HotkeyCategory, Array<HotkeyDefinition & { id: HotkeyId }>> {
	return useMemo(() => {
		const grouped: Record<
			HotkeyCategory,
			Array<HotkeyDefinition & { id: HotkeyId }>
		> = {
			Navigation: [],
			Workspace: [],
			Layout: [],
			Terminal: [],
			Window: [],
			Help: [],
		};

		for (const [id, hotkey] of Object.entries(HOTKEYS)) {
			if (!options?.includeHidden && hotkey.isHidden) continue;
			grouped[hotkey.category].push({ id: id as HotkeyId, ...hotkey });
		}
		return grouped;
	}, [options?.includeHidden]);
}

export function isAppHotkeyEvent(event: KeyboardEvent): boolean {
	const state = useHotkeysStore.getState();
	const overrides = getOverridesForPlatform(state.hotkeysState, state.platform);
	const effective = getEffectiveHotkeysMap(overrides, state.platform);
	return (Object.keys(effective) as HotkeyId[]).some((id) => {
		const keys = effective[id];
		if (!keys) return false;
		return matchesHotkeyEvent(event, keys);
	});
}

export function getHotkeyConflict(
	keys: string,
	excludeId?: HotkeyId,
): HotkeyId | null {
	const state = useHotkeysStore.getState();
	const overrides = getOverridesForPlatform(state.hotkeysState, state.platform);
	const effective = getEffectiveHotkeysMap(overrides, state.platform);
	const canonical = canonicalizeHotkeyForPlatform(keys, state.platform);
	if (!canonical) return null;

	for (const [id, value] of Object.entries(effective)) {
		if (id === excludeId) continue;
		if (value === canonical) return id as HotkeyId;
	}
	return null;
}

export function useHotkeysSync() {
	const platform = useHotkeysStore((state) => state.platform);
	const replace = useHotkeysStore((state) => state.replaceHotkeysState);

	electronTrpc.uiState.hotkeys.subscribe.useSubscription(undefined, {
		onData: () => {
			electronTrpcClient.uiState.hotkeys.get
				.query()
				.then((state: HotkeysState) => {
					// Guard against null/undefined state from storage
					if (!state) {
						console.warn(
							"[hotkeys] Storage returned null/undefined state, skipping sync",
						);
						return;
					}
					const current = useHotkeysStore.getState().hotkeysState;
					// Use structural comparison that's order-independent
					const currentStr = JSON.stringify(
						current,
						Object.keys(current).sort(),
					);
					const newStr = JSON.stringify(state, Object.keys(state).sort());
					if (currentStr === newStr) {
						return;
					}
					// Skip persistence to avoid echo writes back to storage
					setSkipNextHotkeysPersist(true);
					replace(state);
				})
				.catch((error: unknown) => {
					console.error("[hotkeys] Failed to sync hotkeys:", error);
				});
		},
	});

	return platform;
}

export function captureHotkeyFromEvent(
	event: KeyboardEvent,
	platform: HotkeyPlatform,
): string | null {
	return hotkeyFromKeyboardEvent(event, platform);
}

export function useAppHotkey(
	id: HotkeyId,
	callback: (event: KeyboardEvent, handler: unknown) => void,
	options?: { enabled?: boolean; preventDefault?: boolean },
	deps: unknown[] = [],
) {
	const keys = useHotkeyKeys(id);
	const enabled = Boolean(keys) && (options?.enabled ?? true);
	const preventDefault = options?.preventDefault ?? false;
	const callbackRef = useRef(callback);
	callbackRef.current = callback;

	useEffect(() => {
		if (!enabled || !keys) return;
		if (
			typeof document === "undefined" ||
			typeof document.addEventListener !== "function"
		) {
			return;
		}

		const onKeyDown = (event: KeyboardEvent) => {
			if (!matchesHotkeyEvent(event, keys)) return;
			if (preventDefault) event.preventDefault();
			callbackRef.current(event, undefined);
		};

		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [enabled, keys, preventDefault, ...deps]);
}
