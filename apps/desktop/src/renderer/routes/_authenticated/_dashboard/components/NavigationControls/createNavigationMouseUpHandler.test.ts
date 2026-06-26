import { describe, expect, mock, test } from "bun:test";
import { createNavigationMouseUpHandler } from "./createNavigationMouseUpHandler";
import { BROWSER_PANE_ATTR } from "./shouldHandleNavigationMouseUp";

function makeEvent(opts: { button: number; insideBrowserPane?: boolean }): {
	target: EventTarget;
	button: number;
	preventDefault: ReturnType<typeof mock>;
} {
	const target = {
		closest: (selector: string) =>
			opts.insideBrowserPane && selector === `[${BROWSER_PANE_ATTR}]`
				? {}
				: null,
	} as unknown as EventTarget;
	return {
		target,
		button: opts.button,
		preventDefault: mock(() => {}),
	};
}

describe("createNavigationMouseUpHandler", () => {
	test("navigates back when mouse button 4 (event.button=3) fires outside a browser pane", () => {
		const onBack = mock(() => {});
		const onForward = mock(() => {});
		const handler = createNavigationMouseUpHandler({ onBack, onForward });

		const event = makeEvent({ button: 3 });
		handler(event);

		expect(onBack).toHaveBeenCalledTimes(1);
		expect(onForward).not.toHaveBeenCalled();
		expect(event.preventDefault).toHaveBeenCalledTimes(1);
	});

	test("navigates forward when mouse button 5 (event.button=4) fires outside a browser pane", () => {
		const onBack = mock(() => {});
		const onForward = mock(() => {});
		const handler = createNavigationMouseUpHandler({ onBack, onForward });

		const event = makeEvent({ button: 4 });
		handler(event);

		expect(onForward).toHaveBeenCalledTimes(1);
		expect(onBack).not.toHaveBeenCalled();
		expect(event.preventDefault).toHaveBeenCalledTimes(1);
	});

	test("ignores buttons other than 3/4", () => {
		const onBack = mock(() => {});
		const onForward = mock(() => {});
		const handler = createNavigationMouseUpHandler({ onBack, onForward });

		for (const button of [0, 1, 2, 5]) {
			handler(makeEvent({ button }));
		}

		expect(onBack).not.toHaveBeenCalled();
		expect(onForward).not.toHaveBeenCalled();
	});

	test("does NOT navigate when the back button is pressed inside a browser pane (issue #4515)", () => {
		// Repro: with focus inside an embedded browser pane, pressing mouse
		// button 4 should drive the embedded browser's history rather than the
		// Superset shell. The handler must opt out so the webview consumes the
		// event natively.
		const onBack = mock(() => {});
		const onForward = mock(() => {});
		const handler = createNavigationMouseUpHandler({ onBack, onForward });

		const event = makeEvent({ button: 3, insideBrowserPane: true });
		handler(event);

		expect(onBack).not.toHaveBeenCalled();
		expect(event.preventDefault).not.toHaveBeenCalled();
	});

	test("does NOT navigate when the forward button is pressed inside a browser pane (issue #4515)", () => {
		const onBack = mock(() => {});
		const onForward = mock(() => {});
		const handler = createNavigationMouseUpHandler({ onBack, onForward });

		const event = makeEvent({ button: 4, insideBrowserPane: true });
		handler(event);

		expect(onForward).not.toHaveBeenCalled();
		expect(event.preventDefault).not.toHaveBeenCalled();
	});
});
