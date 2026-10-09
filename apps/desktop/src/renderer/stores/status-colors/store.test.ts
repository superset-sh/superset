import { beforeEach, describe, expect, it } from "bun:test";
import { useStatusColorsStore } from "./store";

describe("status colors store", () => {
	beforeEach(() => {
		useStatusColorsStore.setState({ overrides: {} });
	});

	it("stores a lowercase hex override for one status", () => {
		useStatusColorsStore.getState().setStatusColor("permission", "#3B82F6");
		expect(useStatusColorsStore.getState().overrides).toEqual({
			permission: "#3b82f6",
		});
	});

	it("ignores values that are not six-digit hex colors", () => {
		const store = useStatusColorsStore.getState();
		store.setStatusColor("working", "blue");
		store.setStatusColor("working", "#fff");
		expect(useStatusColorsStore.getState().overrides).toEqual({});
	});

	it("resets one status without touching the others", () => {
		const store = useStatusColorsStore.getState();
		store.setStatusColor("working", "#0ea5e9");
		store.setStatusColor("review", "#a855f7");
		store.resetStatusColor("working");
		expect(useStatusColorsStore.getState().overrides).toEqual({
			review: "#a855f7",
		});
	});

	it("keeps the same state reference when resetting a status with no override", () => {
		const before = useStatusColorsStore.getState();
		before.resetStatusColor("failed");
		expect(useStatusColorsStore.getState()).toBe(before);
	});

	it("resets every status", () => {
		const store = useStatusColorsStore.getState();
		store.setStatusColor("working", "#0ea5e9");
		store.setStatusColor("failed", "#000000");
		store.resetAllStatusColors();
		expect(useStatusColorsStore.getState().overrides).toEqual({});
	});
});
