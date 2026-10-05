import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { setAgentSessionPlacement, useAgentSessionPlacement } = await import(
	"./useAgentSessionPlacement"
);

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

test("preserves the existing placement preference", () => {
	window.localStorage.setItem("lastSelectedDiffCommentPlacement", "new-tab");
	const { result } = renderHook(useAgentSessionPlacement);
	expect(result.current).toBe("new-tab");
});

test("updates mounted consumers and persists the choice", () => {
	const first = renderHook(useAgentSessionPlacement);
	const second = renderHook(useAgentSessionPlacement);
	expect(first.result.current).toBe("split-pane");
	act(() => setAgentSessionPlacement("new-tab"));
	expect(first.result.current).toBe("new-tab");
	expect(second.result.current).toBe("new-tab");
	expect(window.localStorage.getItem("lastSelectedDiffCommentPlacement")).toBe(
		"new-tab",
	);
	act(() => setAgentSessionPlacement("invalid"));
	expect(first.result.current).toBe("new-tab");
});

test("responds to preference changes from another window", () => {
	const { result } = renderHook(useAgentSessionPlacement);
	act(() => {
		window.localStorage.setItem("lastSelectedDiffCommentPlacement", "new-tab");
		window.dispatchEvent(
			new StorageEvent("storage", { key: "lastSelectedDiffCommentPlacement" }),
		);
	});
	expect(result.current).toBe("new-tab");
	act(() => {
		window.localStorage.clear();
		window.dispatchEvent(new StorageEvent("storage", { key: null }));
	});
	expect(result.current).toBe("split-pane");
});
