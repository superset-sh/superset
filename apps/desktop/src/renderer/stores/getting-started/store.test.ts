import { beforeEach, expect, test } from "bun:test";
import { createJSONStorage } from "zustand/middleware";
import { useGettingStartedStore } from "./store";

const storage = new Map<string, string>();
useGettingStartedStore.persist.setOptions({
	storage: createJSONStorage(() => ({
		getItem: (key) => storage.get(key) ?? null,
		setItem: (key, value) => {
			storage.set(key, value);
		},
		removeItem: (key) => {
			storage.delete(key);
		},
	})),
});
beforeEach(() => {
	storage.clear();
	useGettingStartedStore.setState({
		tried: 0,
		dismissed: false,
		hasCompleted: false,
	});
});

test("completion persists dismissal and survives rehydration", async () => {
	useGettingStartedStore.getState().complete();
	const saved = storage.get("pro-getting-started-v1");
	useGettingStartedStore.setState({ dismissed: false, hasCompleted: false });
	storage.set("pro-getting-started-v1", saved as string);
	await useGettingStartedStore.persist.rehydrate();
	expect(useGettingStartedStore.getState()).toMatchObject({
		dismissed: true,
		hasCompleted: true,
	});
});

test("Help reopens completed onboarding without resetting completion", () => {
	useGettingStartedStore.getState().complete();
	useGettingStartedStore.getState().show();
	expect(useGettingStartedStore.getState()).toMatchObject({
		dismissed: false,
		hasCompleted: true,
	});
});
