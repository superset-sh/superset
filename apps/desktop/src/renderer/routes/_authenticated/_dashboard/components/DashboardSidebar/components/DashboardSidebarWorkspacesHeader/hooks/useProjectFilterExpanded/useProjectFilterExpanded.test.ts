import { afterAll, afterEach, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document. Process-wide, so this
// unregisters in afterAll to leave the other renderer suites their document.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useProjectFilterExpanded } = await import("./useProjectFilterExpanded");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function render(query: string) {
	return renderHook(({ query }) => useProjectFilterExpanded(query), {
		initialProps: { query },
	});
}

describe("useProjectFilterExpanded", () => {
	it("starts collapsed without a query and opens on request", () => {
		const { result } = render("");
		expect(result.current[0]).toBe(false);
		act(() => result.current[1](true));
		expect(result.current[0]).toBe(true);
	});

	it("stays open while the query is cleared with the × button", () => {
		const { result, rerender } = render("");
		act(() => result.current[1](true));
		rerender({ query: "sort" });
		expect(result.current[0]).toBe(true);
		rerender({ query: "" });
		expect(result.current[0]).toBe(true);
	});

	it("collapses on Escape (query cleared, flag reset)", () => {
		const { result, rerender } = render("");
		act(() => result.current[1](true));
		rerender({ query: "sort" });
		act(() => result.current[1](false));
		rerender({ query: "" });
		expect(result.current[0]).toBe(false);
	});

	// The bulk-selection toolbar replaces the header, so the header remounts
	// with a query that is still filtering the list.
	it("mounts open when a query is already active", () => {
		const { result, rerender } = render("sort");
		expect(result.current[0]).toBe(true);
		// The remounted input still behaves like a user-opened one: clearing
		// the text with × keeps it open.
		rerender({ query: "" });
		expect(result.current[0]).toBe(true);
	});

	it("is forced open by a non-empty query even when the flag is off", () => {
		const { result, rerender } = render("");
		rerender({ query: "sort" });
		expect(result.current[0]).toBe(true);
		rerender({ query: "   " });
		expect(result.current[0]).toBe(false);
	});
});
