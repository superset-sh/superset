import { afterAll, afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useRunAfterMenuClose } = await import("./useRunAfterMenuClose");

afterEach(() => {
	cleanup();
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

test("runs a focus action after the menu closes", () => {
	const input = document.createElement("input");
	document.body.append(input);
	const { result } = renderHook(useRunAfterMenuClose);
	const event = new Event("close-auto-focus", { cancelable: true });

	act(() => {
		result.current.runAfterClose(() => input.focus());
	});
	expect(document.activeElement).not.toBe(input);

	act(() => {
		result.current.onCloseAutoFocus(event);
	});
	expect(event.defaultPrevented).toBe(true);
	expect(document.activeElement).toBe(input);
});
