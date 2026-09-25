import { describe, expect, mock, test } from "bun:test";
import { syncPersistedStoreAcrossWindows } from "./syncPersistedStoreAcrossWindows";

function makeEventTarget() {
	let listener: ((event: StorageEvent) => void) | undefined;
	return {
		target: {
			addEventListener: mock(
				(_type: "storage", next: (event: StorageEvent) => void) => {
					listener = next;
				},
			),
			removeEventListener: mock(
				(_type: "storage", removed: (event: StorageEvent) => void) => {
					if (listener === removed) listener = undefined;
				},
			),
		},
		dispatch: (event: Pick<StorageEvent, "key" | "newValue">) =>
			listener?.(event as StorageEvent),
	};
}

describe("syncPersistedStoreAcrossWindows", () => {
	test("rehydrates only when another renderer updates the store key", () => {
		const events = makeEventTarget();
		const rehydrate = mock(() => Promise.resolve());
		const store = {
			persist: {
				getOptions: () => ({ name: "sidebar-store" }),
				rehydrate,
			},
		};

		const cleanup = syncPersistedStoreAcrossWindows(store, events.target);

		events.dispatch({ key: "another-store", newValue: "{}" });
		events.dispatch({ key: "sidebar-store", newValue: null });
		expect(rehydrate).not.toHaveBeenCalled();

		events.dispatch({ key: "sidebar-store", newValue: "{}" });
		expect(rehydrate).toHaveBeenCalledTimes(1);

		cleanup();
		events.dispatch({ key: "sidebar-store", newValue: "{}" });
		expect(rehydrate).toHaveBeenCalledTimes(1);
		expect(events.target.removeEventListener).toHaveBeenCalledTimes(1);
	});
});
