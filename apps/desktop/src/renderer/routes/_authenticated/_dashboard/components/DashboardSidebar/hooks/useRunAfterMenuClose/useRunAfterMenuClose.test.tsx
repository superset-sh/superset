import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom is process-wide; unregister in afterAll so the shared mock
// document is restored for the other renderer suites.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, render, waitFor } = await import("@testing-library/react");
const { useRunAfterMenuClose } = await import("./useRunAfterMenuClose");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function mountHook() {
	let api: ReturnType<typeof useRunAfterMenuClose> | undefined;
	function Probe() {
		api = useRunAfterMenuClose();
		return null;
	}
	render(<Probe />);
	return {
		ready: () => waitFor(() => expect(api).toBeDefined()),
		get: () => {
			if (!api) throw new Error("hook not mounted");
			return api;
		},
	};
}

function fakeFocusEvent() {
	const state = { prevented: false };
	const event = {
		preventDefault: () => {
			state.prevented = true;
		},
	} as unknown as Event;
	return { event, state };
}

/**
 * The menu keeps focus trapped until its exit animation ends, so an action that
 * moves focus (starting a rename) runs after the close — and only then may the
 * menu's own focus restoration be suppressed. A plain dismissal (Escape, click
 * away) has no pending action and must leave Radix free to restore focus to the
 * trigger, or the keyboard user loses their place when the item disappears
 * (#8133 review).
 */
describe("useRunAfterMenuClose", () => {
	test("a plain dismissal does not suppress the menu's focus restoration", async () => {
		const hook = mountHook();
		await hook.ready();

		const carried = { action: null as (() => void) | null };
		const { event, state } = fakeFocusEvent();

		hook.get().onCloseAutoFocus(event);

		expect(state.prevented).toBe(false);
		expect(carried.action).toBeNull();
	});

	test("a pending action suppresses the restoration and then runs", async () => {
		const hook = mountHook();
		await hook.ready();

		let ran = false;
		hook.get().runAfterClose(() => {
			ran = true;
		});

		const { event, state } = fakeFocusEvent();
		hook.get().onCloseAutoFocus(event);

		expect(state.prevented).toBe(true);
		expect(ran).toBe(true);
	});

	test("a second dismissal after the action ran no longer suppresses", async () => {
		const hook = mountHook();
		await hook.ready();

		hook.get().runAfterClose(() => {});
		const first = fakeFocusEvent();
		hook.get().onCloseAutoFocus(first.event);
		expect(first.state.prevented).toBe(true);

		// The action was consumed; the next close is a plain dismissal again.
		const second = fakeFocusEvent();
		hook.get().onCloseAutoFocus(second.event);
		expect(second.state.prevented).toBe(false);
	});
});
