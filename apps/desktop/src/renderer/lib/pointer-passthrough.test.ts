import { describe, expect, mock, test } from "bun:test";

const toggleAttribute = mock((_name: string, _force?: boolean) => {});
(
	document.documentElement as unknown as Record<string, unknown>
).toggleAttribute = toggleAttribute;

const {
	NATIVE_DRAG_SOURCE,
	POINTER_PASSTHROUGH_ATTRIBUTE,
	pointerPassthrough,
} = await import("./pointer-passthrough");

describe("pointerPassthrough", () => {
	test("stays active until the last source releases, notifying on each edge", () => {
		const seen: boolean[] = [];
		const unsubscribe = pointerPassthrough.subscribe((active) =>
			seen.push(active),
		);
		toggleAttribute.mockClear();
		try {
			pointerPassthrough.set("a", true);
			pointerPassthrough.set("b", true);
			expect(pointerPassthrough.active).toBe(true);
			// One source releasing must not clear a gesture still in flight.
			pointerPassthrough.set("b", false);
			expect(pointerPassthrough.active).toBe(true);
			pointerPassthrough.set("a", false);
			expect(pointerPassthrough.active).toBe(false);

			expect(seen).toEqual([true, false]);
			expect(toggleAttribute.mock.calls).toEqual([
				[POINTER_PASSTHROUGH_ATTRIBUTE, true],
				[POINTER_PASSTHROUGH_ATTRIBUTE, false],
			]);
		} finally {
			unsubscribe();
			pointerPassthrough.set("a", false);
			pointerPassthrough.set("b", false);
		}
	});

	test("releasing a source that was never held is a no-op", () => {
		const seen: boolean[] = [];
		const unsubscribe = pointerPassthrough.subscribe((active) =>
			seen.push(active),
		);
		try {
			pointerPassthrough.set("never", false);
			expect(seen).toEqual([]);
			expect(pointerPassthrough.active).toBe(false);
		} finally {
			unsubscribe();
		}
	});

	test("a native drag holds passthrough from dragstart to drop, dragend or blur", () => {
		const handlers = new Map<string, () => void>();
		const target = {
			addEventListener: (type: string, handler: () => void) => {
				handlers.set(type, handler);
			},
		} as unknown as Window;
		// The module installs on the real window at import; a fresh target
		// exercises the listener wiring itself.
		const fresh = new (Object.getPrototypeOf(pointerPassthrough).constructor)();
		fresh.installNativeDragListeners(target);
		fresh.installNativeDragListeners(target);
		expect([...handlers.keys()].sort()).toEqual([
			"blur",
			"dragend",
			"dragstart",
			"drop",
		]);

		for (const end of ["drop", "dragend", "blur"] as const) {
			handlers.get("dragstart")?.();
			expect(fresh.active).toBe(true);
			handlers.get(end)?.();
			expect(fresh.active).toBe(false);
		}
		expect(NATIVE_DRAG_SOURCE).toBe("native-drag");
	});
});
