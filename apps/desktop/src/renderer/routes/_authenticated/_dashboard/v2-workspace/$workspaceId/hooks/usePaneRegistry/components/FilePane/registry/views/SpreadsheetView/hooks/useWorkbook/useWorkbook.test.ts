import { afterAll, afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { WorkbookSource } from "../../types";
import type {
	SheetRequest,
	SheetResponse,
} from "../../utils/sheetWorker/protocol";
import { useWorkbook } from "./useWorkbook";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const { act, cleanup, renderHook } = await import("@testing-library/react");
afterEach(cleanup);
afterAll(() => {
	if (!alreadyRegistered) GlobalRegistrator.unregister();
});

test("a workbook that fails to open releases its worker at once", async () => {
	let terminated = 0;
	const worker = {
		onmessage: null as ((event: MessageEvent<SheetResponse>) => void) | null,
		onerror: null,
		postMessage(message: unknown) {
			const { id } = message as SheetRequest;
			queueMicrotask(() =>
				worker.onmessage?.({
					data: { id, ok: false, reason: "password" },
				} as MessageEvent<SheetResponse>),
			);
		},
		terminate() {
			terminated += 1;
		},
	};
	const source: WorkbookSource = {
		kind: "bytes",
		bytes: new Uint8Array(),
		fileName: "locked.xlsx",
	};
	const createWorker = () => worker as unknown as Worker;
	const hook = renderHook(() => useWorkbook(source, createWorker));
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	expect(hook.result.current).toEqual({ status: "error", reason: "password" });
	expect(terminated).toBe(1);
});

test("a synchronous worker factory failure enters the error state", async () => {
	const source: WorkbookSource = {
		kind: "bytes",
		bytes: new Uint8Array(),
		fileName: "broken.xlsx",
	};
	const createWorker = () => {
		throw new Error("Worker construction failed");
	};
	const hook = renderHook(() => useWorkbook(source, createWorker));
	await act(async () => {
		await Promise.resolve();
	});
	expect(hook.result.current).toEqual({ status: "error", reason: null });
});
