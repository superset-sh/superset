import { describe, expect, it, beforeEach } from "bun:test";
import { usePresetChordStore } from "./preset-chord-store";

describe("preset-chord-store", () => {
	beforeEach(() => {
		// Reset store state between tests
		usePresetChordStore.setState({ isChordActive: false });
	});

	it("initializes with isChordActive as false", () => {
		const state = usePresetChordStore.getState();
		expect(state.isChordActive).toBe(false);
	});

	it("sets isChordActive to true", () => {
		const { setChordActive } = usePresetChordStore.getState();
		setChordActive(true);

		const state = usePresetChordStore.getState();
		expect(state.isChordActive).toBe(true);
	});

	it("sets isChordActive to false", () => {
		// First set to true
		usePresetChordStore.getState().setChordActive(true);
		expect(usePresetChordStore.getState().isChordActive).toBe(true);

		// Then set to false
		usePresetChordStore.getState().setChordActive(false);
		expect(usePresetChordStore.getState().isChordActive).toBe(false);
	});

	it("toggles isChordActive state correctly", () => {
		const { setChordActive } = usePresetChordStore.getState();

		// Start false
		expect(usePresetChordStore.getState().isChordActive).toBe(false);

		// Toggle on
		setChordActive(true);
		expect(usePresetChordStore.getState().isChordActive).toBe(true);

		// Toggle off
		setChordActive(false);
		expect(usePresetChordStore.getState().isChordActive).toBe(false);

		// Toggle on again
		setChordActive(true);
		expect(usePresetChordStore.getState().isChordActive).toBe(true);
	});
});
