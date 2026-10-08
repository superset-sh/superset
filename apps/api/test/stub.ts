import { afterAll, beforeAll, spyOn } from "bun:test";

// `mock.module` has no undo and reaches every test file that loads later; this
// swaps members of a live object or module namespace for one file only.
export function stub<T extends object>(
	target: T,
	fakes: Partial<Record<keyof T, unknown>>,
): void {
	const restores: Array<() => void> = [];
	beforeAll(() => {
		for (const [key, fake] of Object.entries(fakes)) {
			if (typeof fake === "function") {
				const spy = spyOn(target, key as never).mockImplementation(
					fake as never,
				);
				restores.push(() => spy.mockRestore());
				continue;
			}
			const previous = Object.getOwnPropertyDescriptor(target, key);
			Reflect.set(target, key, fake);
			restores.push(() => {
				if (previous) Object.defineProperty(target, key, previous);
				else Reflect.deleteProperty(target, key);
			});
		}
	});
	afterAll(() => {
		for (const restore of restores.reverse()) restore();
	});
}
