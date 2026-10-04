import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { CellPosition, SearchResult } from "../../types";
import type { SheetWorkerClient } from "../../utils/sheetWorker";
import { useSheetSearch } from "./useSheetSearch";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const { act, cleanup, renderHook } = await import("@testing-library/react");
afterEach(cleanup);
afterAll(() => {
	if (!alreadyRegistered) GlobalRegistrator.unregister();
});

interface SearchCall {
	sheet: number;
	query: string;
	resolve: (result: SearchResult) => void;
	reject: (error: Error) => void;
}

function fakeClient() {
	const calls: SearchCall[] = [];
	const client = {
		request: (body: { sheet: number; query: string }) =>
			new Promise<SearchResult>((resolve, reject) =>
				calls.push({ sheet: body.sheet, query: body.query, resolve, reject }),
			),
	} as unknown as SheetWorkerClient;
	return { client, calls };
}

const tick = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});

const found = (...matches: number[]): SearchResult => ({
	matches,
	truncated: false,
});

function setup() {
	const { client, calls } = fakeClient();
	const revealed: CellPosition[] = [];
	const hook = renderHook(
		({ sheetIndex }: { sheetIndex: number }) =>
			useSheetSearch({
				client,
				sheetIndex,
				colCount: 10,
				numbers: { group: ",", decimal: "." },
				onReveal: (cell) => revealed.push(cell),
				delayMs: 0,
			}),
		{ initialProps: { sheetIndex: 0 } },
	);
	return { hook, calls, revealed };
}

test("results of another sheet are dropped as soon as the sheet changes", async () => {
	const { hook, calls, revealed } = setup();
	act(() => hook.result.current.open());
	act(() => hook.result.current.setQuery("total"));
	await tick();
	await act(async () => calls[0]?.resolve(found(4, 1, 7, 2)));
	expect(hook.result.current.matchCount).toBe(2);

	hook.rerender({ sheetIndex: 1 });
	expect(hook.result.current.matchCount).toBe(0);
	expect(hook.result.current.activeMatch).toBeNull();
	revealed.length = 0;
	act(() => hook.result.current.findNext());
	expect(revealed).toEqual([]);

	await tick();
	expect(calls.at(-1)).toMatchObject({ sheet: 1, query: "total" });
	await act(async () => calls.at(-1)?.resolve(found(9, 0)));
	expect(hook.result.current.activeMatch).toEqual({ row: 9, col: 0 });
});

test("a late answer to an older query is ignored", async () => {
	const { hook, calls } = setup();
	act(() => hook.result.current.open());
	act(() => hook.result.current.setQuery("a"));
	await tick();
	act(() => hook.result.current.setQuery("ab"));
	expect(hook.result.current.matchCount).toBe(0);
	await tick();
	const [older, newer] = calls;
	await act(async () => newer?.resolve(found(1, 1)));
	await act(async () => older?.resolve(found(0, 0, 2, 2, 3, 3)));
	expect(hook.result.current.matchCount).toBe(1);
	expect(hook.result.current.activeMatch).toEqual({ row: 1, col: 1 });
});

test("says a search is running or failed, and has no results only once answered", async () => {
	const { hook, calls } = setup();
	expect(hook.result.current.status).toBe("idle");
	act(() => hook.result.current.open());
	act(() => hook.result.current.setQuery("x"));
	expect(hook.result.current.status).toBe("pending");
	await tick();
	expect(hook.result.current.status).toBe("pending");
	const log = spyOn(console, "error").mockImplementation(() => {});
	await act(async () => calls[0]?.reject(new Error("worker died")));
	expect(hook.result.current.status).toBe("error");
	expect(log).toHaveBeenCalledTimes(1);
	log.mockRestore();

	act(() => hook.result.current.setQuery("xy"));
	expect(hook.result.current.status).toBe("pending");
	await tick();
	await act(async () => calls[1]?.resolve(found()));
	expect(hook.result.current.status).toBe("done");
	expect(hook.result.current.matchCount).toBe(0);
});
