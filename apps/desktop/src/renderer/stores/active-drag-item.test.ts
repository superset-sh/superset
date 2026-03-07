import { beforeEach, describe, expect, test } from "bun:test";
import { getActiveDragItem, useActiveDragItemStore } from "./active-drag-item";

const testItem = {
	id: "ws-1",
	projectId: "p-1",
	sectionId: null,
	index: 0,
	originalIndex: 0,
};

describe("useActiveDragItemStore", () => {
	beforeEach(() => {
		useActiveDragItemStore.getState().clearActiveDragItem();
	});

	test("initial state is null", () => {
		expect(useActiveDragItemStore.getState().activeDragItem).toBeNull();
	});

	test("setActiveDragItem stores the item", () => {
		useActiveDragItemStore.getState().setActiveDragItem(testItem);
		expect(useActiveDragItemStore.getState().activeDragItem).toEqual(testItem);
	});

	test("clearActiveDragItem resets to null", () => {
		useActiveDragItemStore.getState().setActiveDragItem(testItem);
		useActiveDragItemStore.getState().clearActiveDragItem();
		expect(useActiveDragItemStore.getState().activeDragItem).toBeNull();
	});

	test("setActiveDragItem overwrites previous item", () => {
		useActiveDragItemStore.getState().setActiveDragItem(testItem);
		const newItem = { ...testItem, id: "ws-2", index: 3 };
		useActiveDragItemStore.getState().setActiveDragItem(newItem);
		expect(useActiveDragItemStore.getState().activeDragItem).toEqual(newItem);
	});
});

describe("getActiveDragItem", () => {
	beforeEach(() => {
		useActiveDragItemStore.getState().clearActiveDragItem();
	});

	test("returns null when no active item", () => {
		expect(getActiveDragItem()).toBeNull();
	});

	test("returns the current active item", () => {
		useActiveDragItemStore.getState().setActiveDragItem(testItem);
		expect(getActiveDragItem()).toEqual(testItem);
	});
});
