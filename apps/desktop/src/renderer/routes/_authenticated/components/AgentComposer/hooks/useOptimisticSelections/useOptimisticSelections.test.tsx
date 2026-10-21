import { afterEach, expect, test } from "bun:test";

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useOptimisticSelections } = await import("./useOptimisticSelections");

afterEach(cleanup);

const settle = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

test("a pick shows at once and commits", () => {
	let committed = 0;
	const hook = renderHook(() => useOptimisticSelections({ effort: "high" }));

	act(() =>
		hook.result.current.select("effort", "max", () => {
			committed += 1;
		}),
	);

	expect(hook.result.current.shown("effort")).toBe("max");
	expect(committed).toBe(1);
});

test("the settled value takes over once it moves off the picked-against one", () => {
	const hook = renderHook(({ effort }) => useOptimisticSelections({ effort }), {
		initialProps: { effort: "high" },
	});
	act(() => hook.result.current.select("effort", "max", () => {}));

	hook.rerender({ effort: "max" });
	expect(hook.result.current.shown("effort")).toBe("max");

	hook.rerender({ effort: "low" });
	expect(hook.result.current.shown("effort")).toBe("low");
});

test("a pick the agent never echoes reverts after the settle delay", async () => {
	const hook = renderHook(() => useOptimisticSelections({ mode: "ask" }, 20));
	act(() => hook.result.current.select("mode", "auto", () => {}));
	expect(hook.result.current.shown("mode")).toBe("auto");

	await act(() => settle(40));

	expect(hook.result.current.shown("mode")).toBe("ask");
});

test("a newer pick on the same key replaces the older one", () => {
	const hook = renderHook(() => useOptimisticSelections({ effort: "high" }));
	act(() => hook.result.current.select("effort", "max", () => {}));
	act(() => hook.result.current.select("effort", "low", () => {}));

	expect(hook.result.current.shown("effort")).toBe("low");
});
