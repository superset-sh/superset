import { describe, expect, it } from "bun:test";
import {
	BLOCKED_DRAG_ATTRIBUTE,
	watchBlockedDragAttempts,
} from "./watchBlockedDragAttempts";

function pointer(
	type: string,
	init: { x?: number; y?: number; button?: number; blocked?: boolean } = {},
) {
	const event = new Event(type);
	const target = {
		closest: (selector: string) =>
			init.blocked !== false && selector === `[${BLOCKED_DRAG_ATTRIBUTE}]`
				? {}
				: null,
	};
	Object.defineProperties(event, {
		button: { value: init.button ?? 0 },
		clientX: { value: init.x ?? 0 },
		clientY: { value: init.y ?? 0 },
		target: { value: target },
	});
	return event;
}

function setup() {
	const root = new EventTarget();
	let attempts = 0;
	const stop = watchBlockedDragAttempts(root, () => {
		attempts += 1;
	});
	return { root, stop, attempts: () => attempts };
}

describe("watchBlockedDragAttempts", () => {
	it("reports a press that moves past the drag threshold on an inert row", () => {
		const { root, attempts } = setup();
		root.dispatchEvent(pointer("pointerdown"));
		root.dispatchEvent(pointer("pointermove", { x: 3 }));
		expect(attempts()).toBe(0);
		root.dispatchEvent(pointer("pointermove", { x: 4, y: 4 }));
		expect(attempts()).toBe(1);
	});

	it("reports once per press however far the pointer travels", () => {
		const { root, attempts } = setup();
		root.dispatchEvent(pointer("pointerdown"));
		root.dispatchEvent(pointer("pointermove", { y: 20 }));
		root.dispatchEvent(pointer("pointermove", { y: 60 }));
		expect(attempts()).toBe(1);
	});

	it("ignores a click, however jittery", () => {
		const { root, attempts } = setup();
		root.dispatchEvent(pointer("pointerdown"));
		root.dispatchEvent(pointer("pointermove", { x: 2, y: 2 }));
		root.dispatchEvent(pointer("pointerup"));
		root.dispatchEvent(pointer("pointermove", { x: 50 }));
		expect(attempts()).toBe(0);
	});

	it("ignores rows that can be dragged and non-primary buttons", () => {
		const { root, attempts } = setup();
		root.dispatchEvent(pointer("pointerdown", { blocked: false }));
		root.dispatchEvent(pointer("pointermove", { x: 50 }));
		root.dispatchEvent(pointer("pointerup"));
		root.dispatchEvent(pointer("pointerdown", { button: 2 }));
		root.dispatchEvent(pointer("pointermove", { x: 50 }));
		expect(attempts()).toBe(0);
	});

	it("stops reporting once torn down, even mid-press", () => {
		const { root, stop, attempts } = setup();
		root.dispatchEvent(pointer("pointerdown"));
		stop();
		root.dispatchEvent(pointer("pointermove", { x: 50 }));
		root.dispatchEvent(pointer("pointerdown"));
		root.dispatchEvent(pointer("pointermove", { x: 50 }));
		expect(attempts()).toBe(0);
	});
});
