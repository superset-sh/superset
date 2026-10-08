import { afterEach, expect, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, renderHook } = await import("@testing-library/react");
const { useStableList } = await import("./useStableList");

afterEach(cleanup);
test("keeps the previous array while its entries are the same", () => {
	const a = { id: "a" };
	const b = { id: "b" };
	const { result, rerender } = renderHook(({ list }) => useStableList(list), {
		initialProps: { list: [a, b] },
	});
	const first = result.current;
	rerender({ list: [a, b] });
	expect(result.current).toBe(first);
	rerender({ list: [a] });
	expect(result.current).toEqual([a]);
	expect(result.current).not.toBe(first);
});

test("keeps the previous array when the comparator calls recreated entries equal", () => {
	const sameId = (previous: { id: string }, next: { id: string }) =>
		previous.id === next.id;
	const { result, rerender } = renderHook(
		({ list }) => useStableList(list, sameId),
		{ initialProps: { list: [{ id: "a" }] } },
	);
	const first = result.current;
	rerender({ list: [{ id: "a" }] });
	expect(result.current).toBe(first);
	rerender({ list: [{ id: "b" }] });
	expect(result.current).toEqual([{ id: "b" }]);
});
