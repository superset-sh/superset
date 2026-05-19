import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	createWorkspaceStore,
	getSpatialNeighborPaneId,
} from "@superset/panes";
import {
	HOTKEYS,
	HOTKEYS_REGISTRY,
	type HotkeyId,
	PLATFORM,
} from "../registry";
import { useHotkeyOverridesStore } from "../stores/hotkeyOverridesStore";
import {
	canonicalizeChord,
	eventToChord,
	matchesChord,
	resolveHotkeyFromEvent,
} from "./resolveHotkeyFromEvent";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Asserts a value is non-null/undefined and returns it (avoids `!` operator). */
function assertDefined<T>(val: T | null | undefined, label?: string): T {
	if (val == null) throw new Error(`Expected ${label ?? "value"} to be defined`);
	return val;
}

/** Build a minimal KeyboardEvent stub matching a given keyboard chord. */
function buildEventFromChord(chord: string): KeyboardEvent {
	const parts = chord.toLowerCase().split("+");
	const mods = {
		metaKey: parts.includes("meta"),
		ctrlKey: parts.includes("ctrl") || parts.includes("control"),
		altKey: parts.includes("alt"),
		shiftKey: parts.includes("shift"),
	};
	const key = parts.find(
		(p) => !["meta", "ctrl", "control", "alt", "shift"].includes(p),
	);
	const code = chordKeyToCode(key ?? "");
	return {
		type: "keydown",
		code,
		key: "",
		...mods,
	} as unknown as KeyboardEvent;
}

function chordKeyToCode(key: string): string {
	if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`;
	if (/^[0-9]$/.test(key)) return `Digit${key}`;
	switch (key) {
		case "arrowup":
		case "up":
			return "ArrowUp";
		case "arrowdown":
		case "down":
			return "ArrowDown";
		case "arrowleft":
		case "left":
			return "ArrowLeft";
		case "arrowright":
		case "right":
			return "ArrowRight";
		default:
			return key;
	}
}

// ---------------------------------------------------------------------------
// Tests: FOCUS_PANE_* hotkey registration and resolution
// ---------------------------------------------------------------------------

describe("FOCUS_PANE hotkeys — registry", () => {
	const FOCUS_IDS: HotkeyId[] = [
		"FOCUS_PANE_LEFT",
		"FOCUS_PANE_RIGHT",
		"FOCUS_PANE_UP",
		"FOCUS_PANE_DOWN",
	];

	it("every FOCUS_PANE_* ID has a non-null binding on all platforms", () => {
		for (const id of FOCUS_IDS) {
			const reg = HOTKEYS_REGISTRY[id];
			expect(reg.key.mac).not.toBeNull();
			expect(reg.key.windows).not.toBeNull();
			expect(reg.key.linux).not.toBeNull();
		}
	});

	it("platform-resolved HOTKEYS have non-null key for FOCUS_PANE_*", () => {
		for (const id of FOCUS_IDS) {
			expect(HOTKEYS[id].key).not.toBeNull();
			expect(typeof HOTKEYS[id].key).toBe("string");
		}
	});

	it("no two FOCUS_PANE_* bindings collide with each other", () => {
		const canonical = FOCUS_IDS.map((id) =>
			canonicalizeChord(assertDefined(HOTKEYS[id].key, `${id}.key`)),
		);
		expect(new Set(canonical).size).toBe(FOCUS_IDS.length);
	});

	// Some hotkeys intentionally share chords because they're scoped to
	// different pane types via `enabled: ctx.isActive` (e.g. FIND_IN_TERMINAL
	// vs FIND_IN_CHAT). FOCUS_PANE_* must NOT collide with any of those — they
	// are workspace-level hotkeys with no `enabled` guard.
	it("no FOCUS_PANE_* binding collides with any other hotkey", () => {
		const focusChords = new Set(
			FOCUS_IDS.map((id) =>
				canonicalizeChord(assertDefined(HOTKEYS[id].key, `${id}.key`)),
			),
		);
		for (const [id, def] of Object.entries(HOTKEYS)) {
			if (FOCUS_IDS.includes(id as HotkeyId)) continue;
			if (!def.key) continue;
			const c = canonicalizeChord(def.key);
			expect(
				focusChords.has(c),
				`${id} (${def.key}) collides with a FOCUS_PANE binding`,
			).toBe(false);
		}
	});

	// Regression: SCROLL_TO_BOTTOM previously used ctrl+shift+alt+down on
	// Windows/Linux, which is the same chord as FOCUS_PANE_DOWN. This caused
	// FOCUS_PANE_DOWN to be shadowed and pane navigation to break.
	it("SCROLL_TO_BOTTOM does not collide with FOCUS_PANE_DOWN on any platform", () => {
		for (const platform of ["mac", "windows", "linux"] as const) {
			const scrollKey = HOTKEYS_REGISTRY.SCROLL_TO_BOTTOM.key[platform];
			const focusKey = HOTKEYS_REGISTRY.FOCUS_PANE_DOWN.key[platform];
			if (!scrollKey || !focusKey) continue;
			expect(
				canonicalizeChord(scrollKey),
				`collision on ${platform}: SCROLL_TO_BOTTOM "${scrollKey}" vs FOCUS_PANE_DOWN "${focusKey}"`,
			).not.toBe(canonicalizeChord(focusKey));
		}
	});
});

describe("FOCUS_PANE hotkeys — resolveHotkeyFromEvent", () => {
	let originalOverrides: Record<string, string | null>;
	beforeEach(() => {
		originalOverrides = useHotkeyOverridesStore.getState().overrides;
	});
	afterEach(() => {
		useHotkeyOverridesStore.setState({ overrides: originalOverrides });
	});

	const FOCUS_MAP: [HotkeyId, string][] = [
		["FOCUS_PANE_LEFT", "FOCUS_PANE_LEFT"],
		["FOCUS_PANE_RIGHT", "FOCUS_PANE_RIGHT"],
		["FOCUS_PANE_UP", "FOCUS_PANE_UP"],
		["FOCUS_PANE_DOWN", "FOCUS_PANE_DOWN"],
	];

	for (const [id] of FOCUS_MAP) {
		it(`resolves ${id} from its default keyboard event`, () => {
			const keys = assertDefined(HOTKEYS[id].key, `${id}.key`);
			const event = buildEventFromChord(keys);
			expect(resolveHotkeyFromEvent(event)).toBe(id);
		});
	}

	it("resolves FOCUS_PANE_LEFT from the macOS chord (meta+alt+left)", () => {
		// This simulates the macOS keyboard event regardless of test platform
		const event = buildEventFromChord("meta+alt+left");
		const canonical = canonicalizeChord("meta+alt+left");
		const registryCanonical = canonicalizeChord(
			assertDefined(HOTKEYS_REGISTRY.FOCUS_PANE_LEFT.key.mac, "mac key"),
		);
		expect(canonical).toBe(registryCanonical);

		// On macOS platform, this event should resolve to FOCUS_PANE_LEFT
		if (PLATFORM === "mac") {
			expect(resolveHotkeyFromEvent(event)).toBe("FOCUS_PANE_LEFT");
		}
	});

	it("resolves all four macOS pane focus chords (meta+alt+arrow)", () => {
		const macChords: [string, HotkeyId][] = [
			["meta+alt+left", "FOCUS_PANE_LEFT"],
			["meta+alt+right", "FOCUS_PANE_RIGHT"],
			["meta+alt+up", "FOCUS_PANE_UP"],
			["meta+alt+down", "FOCUS_PANE_DOWN"],
		];
		for (const [chord, expectedId] of macChords) {
			const event = buildEventFromChord(chord);
			const eventChord = eventToChord(event);
			const registryChord = canonicalizeChord(
				assertDefined(HOTKEYS_REGISTRY[expectedId].key.mac, `${expectedId} mac key`),
			);
			expect(eventChord).toBe(registryChord);

			if (PLATFORM === "mac") {
				expect(resolveHotkeyFromEvent(event)).toBe(expectedId);
			}
		}
	});

	it("matchesChord agrees with resolveHotkeyFromEvent for pane focus keys", () => {
		for (const [id] of FOCUS_MAP) {
			const keys = assertDefined(HOTKEYS[id].key, `${id}.key`);
			const event = buildEventFromChord(keys);
			expect(matchesChord(event, keys)).toBe(true);
			expect(resolveHotkeyFromEvent(event)).toBe(id);
		}
	});

	it("does NOT resolve pane focus when overrides set them to null", () => {
		useHotkeyOverridesStore.setState({
			overrides: {
				FOCUS_PANE_LEFT: null,
				FOCUS_PANE_RIGHT: null,
				FOCUS_PANE_UP: null,
				FOCUS_PANE_DOWN: null,
			},
		});
		for (const [id] of FOCUS_MAP) {
			const keys = assertDefined(HOTKEYS[id].key, `${id}.key`);
			const event = buildEventFromChord(keys);
			expect(resolveHotkeyFromEvent(event)).toBeNull();
		}
	});

	it("resolves rebound pane focus hotkeys via overrides", () => {
		useHotkeyOverridesStore.setState({
			overrides: { FOCUS_PANE_LEFT: "meta+shift+f9" },
		});
		const event = buildEventFromChord("meta+shift+f9");
		expect(resolveHotkeyFromEvent(event)).toBe("FOCUS_PANE_LEFT");

		// Old default should no longer resolve
		const oldEvent = buildEventFromChord(assertDefined(HOTKEYS.FOCUS_PANE_LEFT.key, "FOCUS_PANE_LEFT.key"));
		expect(resolveHotkeyFromEvent(oldEvent)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Tests: pane spatial navigation (the callback triggered by the hotkey)
// ---------------------------------------------------------------------------

describe("FOCUS_PANE hotkeys — spatial navigation integration", () => {
	/**
	 * Simulates the `moveFocusDirectional` callback from useWorkspaceHotkeys:
	 * gets the active tab, finds the spatial neighbor, and calls setActivePane.
	 */
	function moveFocusDirectional(
		store: ReturnType<typeof createWorkspaceStore>,
		dir: "left" | "right" | "up" | "down",
	) {
		const state = store.getState();
		const tab = state.getActiveTab();
		if (!tab || !tab.activePaneId) return;
		const neighbor = getSpatialNeighborPaneId(
			tab.layout,
			tab.activePaneId,
			dir,
		);
		if (neighbor) state.setActivePane({ tabId: tab.id, paneId: neighbor });
	}

	it("moves focus left/right between two horizontal panes", () => {
		const store = createWorkspaceStore<{ terminalId: string }>();
		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "t1" } }],
		});
		const tab = assertDefined(store.getState().getActiveTab(), "active tab");
		store.getState().splitPane({
			tabId: tab.id,
			paneId: assertDefined(tab.activePaneId, "activePaneId"),
			position: "right",
			newPane: { kind: "terminal", data: { terminalId: "t2" } },
		});

		// After split, the new pane (right) is active
		const afterSplit = assertDefined(store.getState().getActiveTab(), "tab after split");
		const paneIds = Object.keys(afterSplit.panes);
		expect(paneIds).toHaveLength(2);

		const rightPaneId = assertDefined(afterSplit.activePaneId, "right pane");
		const leftPaneId = assertDefined(paneIds.find((id) => id !== rightPaneId), "left pane");

		// Active is right pane; move left
		moveFocusDirectional(store, "left");
		expect(store.getState().getActiveTab()?.activePaneId).toBe(leftPaneId);

		// Active is left pane; move right
		moveFocusDirectional(store, "right");
		expect(store.getState().getActiveTab()?.activePaneId).toBe(rightPaneId);

		// At right edge, moving right again should stay put
		moveFocusDirectional(store, "right");
		expect(store.getState().getActiveTab()?.activePaneId).toBe(rightPaneId);
	});

	it("moves focus up/down between two vertical panes", () => {
		const store = createWorkspaceStore<{ terminalId: string }>();
		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "t1" } }],
		});
		const tab = assertDefined(store.getState().getActiveTab(), "active tab");
		store.getState().splitPane({
			tabId: tab.id,
			paneId: assertDefined(tab.activePaneId, "activePaneId"),
			position: "bottom",
			newPane: { kind: "terminal", data: { terminalId: "t2" } },
		});

		const afterSplit = assertDefined(store.getState().getActiveTab(), "tab after split");
		const paneIds = Object.keys(afterSplit.panes);
		const bottomPaneId = assertDefined(afterSplit.activePaneId, "bottom pane");
		const topPaneId = assertDefined(paneIds.find((id) => id !== bottomPaneId), "top pane");

		// Active is bottom pane; move up
		moveFocusDirectional(store, "up");
		expect(store.getState().getActiveTab()?.activePaneId).toBe(topPaneId);

		// Active is top pane; move down
		moveFocusDirectional(store, "down");
		expect(store.getState().getActiveTab()?.activePaneId).toBe(bottomPaneId);
	});

	it("navigates a 2x2 grid in all four directions", () => {
		const store = createWorkspaceStore<{ terminalId: string }>();
		// Create first pane
		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "t1" } }],
		});
		const tab = assertDefined(store.getState().getActiveTab(), "active tab");
		const topLeftId = assertDefined(tab.activePaneId, "top-left pane");

		// Split right to create top-right
		store.getState().splitPane({
			tabId: tab.id,
			paneId: topLeftId,
			position: "right",
			newPane: { kind: "terminal", data: { terminalId: "t2" } },
		});
		const topRightId = assertDefined(store.getState().getActiveTab()?.activePaneId, "top-right pane");

		// Split top-left down to create bottom-left
		store.getState().splitPane({
			tabId: tab.id,
			paneId: topLeftId,
			position: "bottom",
			newPane: { kind: "terminal", data: { terminalId: "t3" } },
		});
		const bottomLeftId = assertDefined(store.getState().getActiveTab()?.activePaneId, "bottom-left pane");

		// Split top-right down to create bottom-right
		store.getState().splitPane({
			tabId: tab.id,
			paneId: topRightId,
			position: "bottom",
			newPane: { kind: "terminal", data: { terminalId: "t4" } },
		});
		const bottomRightId = assertDefined(store.getState().getActiveTab()?.activePaneId, "bottom-right pane");

		// We're at bottom-right; navigate left
		moveFocusDirectional(store, "left");
		expect(store.getState().getActiveTab()?.activePaneId).toBe(bottomLeftId);

		// Navigate up from bottom-left
		moveFocusDirectional(store, "up");
		expect(store.getState().getActiveTab()?.activePaneId).toBe(topLeftId);

		// Navigate right from top-left
		moveFocusDirectional(store, "right");
		expect(store.getState().getActiveTab()?.activePaneId).toBe(topRightId);

		// Navigate down from top-right
		moveFocusDirectional(store, "down");
		expect(store.getState().getActiveTab()?.activePaneId).toBe(bottomRightId);
	});

	it("does nothing with a single pane (no neighbor)", () => {
		const store = createWorkspaceStore<{ terminalId: string }>();
		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "t1" } }],
		});
		const paneId = assertDefined(store.getState().getActiveTab()?.activePaneId, "single pane");

		for (const dir of ["left", "right", "up", "down"] as const) {
			moveFocusDirectional(store, dir);
			expect(store.getState().getActiveTab()?.activePaneId).toBe(paneId);
		}
	});
});

// ---------------------------------------------------------------------------
// Tests: end-to-end hotkey → action pipeline
// ---------------------------------------------------------------------------

describe("FOCUS_PANE hotkeys — end-to-end (event → resolve → navigate)", () => {
	let originalOverrides: Record<string, string | null>;
	beforeEach(() => {
		originalOverrides = useHotkeyOverridesStore.getState().overrides;
	});
	afterEach(() => {
		useHotkeyOverridesStore.setState({ overrides: originalOverrides });
	});

	const DIRECTION_MAP: Record<HotkeyId, "left" | "right" | "up" | "down"> = {
		FOCUS_PANE_LEFT: "left",
		FOCUS_PANE_RIGHT: "right",
		FOCUS_PANE_UP: "up",
		FOCUS_PANE_DOWN: "down",
	} as Record<HotkeyId, "left" | "right" | "up" | "down">;

	it("keyboard event for each FOCUS_PANE_* resolves to the correct direction and navigates", () => {
		// Set up a workspace with a 2-pane horizontal split
		const store = createWorkspaceStore<{ terminalId: string }>();
		store.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "t1" } }],
		});
		const tab = assertDefined(store.getState().getActiveTab(), "active tab");
		const leftPaneId = assertDefined(tab.activePaneId, "left pane");

		store.getState().splitPane({
			tabId: tab.id,
			paneId: leftPaneId,
			position: "right",
			newPane: { kind: "terminal", data: { terminalId: "t2" } },
		});
		const _rightPaneId = assertDefined(store.getState().getActiveTab()?.activePaneId, "right pane");

		// Simulate the full pipeline: keyboard event → resolve → navigate
		for (const hotkeyId of [
			"FOCUS_PANE_LEFT",
			"FOCUS_PANE_RIGHT",
		] as HotkeyId[]) {
			const keys = HOTKEYS[hotkeyId].key;
			if (!keys) continue;

			const event = buildEventFromChord(keys);
			const resolved = resolveHotkeyFromEvent(event);
			expect(resolved).toBe(hotkeyId);

			const dir = DIRECTION_MAP[hotkeyId];
			const state = store.getState();
			const currentTab = assertDefined(state.getActiveTab(), "current tab");
			const neighbor = getSpatialNeighborPaneId(
				currentTab.layout,
				assertDefined(currentTab.activePaneId, "activePaneId"),
				dir,
			);
			if (neighbor) {
				state.setActivePane({ tabId: currentTab.id, paneId: neighbor });
			}
		}
	});

	it("terminal isAppHotkey pattern returns false (bubble) for pane focus events", () => {
		// This simulates the terminal's attachCustomKeyEventHandler logic:
		// (event) => !isAppHotkey(event)
		// where isAppHotkey = resolveHotkeyFromEvent(event) !== null
		for (const id of [
			"FOCUS_PANE_LEFT",
			"FOCUS_PANE_RIGHT",
			"FOCUS_PANE_UP",
			"FOCUS_PANE_DOWN",
		] as HotkeyId[]) {
			const keys = HOTKEYS[id].key;
			if (!keys) continue;

			const event = buildEventFromChord(keys);
			const isAppHotkey = resolveHotkeyFromEvent(event) !== null;
			// Terminal handler returns !isAppHotkey — false means "don't let xterm handle it"
			const xtermShouldHandle = !isAppHotkey;
			expect(
				xtermShouldHandle,
				`${id} (${keys}) should NOT be handled by xterm (should bubble to app)`,
			).toBe(false);
		}
	});
});
