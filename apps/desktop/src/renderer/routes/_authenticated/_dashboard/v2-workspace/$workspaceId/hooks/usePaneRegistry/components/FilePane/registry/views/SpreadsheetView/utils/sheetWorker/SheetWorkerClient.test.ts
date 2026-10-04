import { expect, test } from "bun:test";
import type { SheetRequest, SheetResponse } from "./protocol";
import { SheetWorkerClient, SheetWorkerError } from "./SheetWorkerClient";

function fakeWorker() {
	const posted: SheetRequest[] = [];
	let terminated = 0;
	const worker = {
		onmessage: null as ((event: MessageEvent<SheetResponse>) => void) | null,
		onerror: null as ((event: ErrorEvent) => void) | null,
		postMessage: (message: unknown) => posted.push(message as SheetRequest),
		terminate: () => {
			terminated += 1;
		},
	};
	const reply = (response: SheetResponse) =>
		worker.onmessage?.({ data: response } as MessageEvent<SheetResponse>);
	return { worker, posted, reply, terminated: () => terminated };
}

const WINDOW = { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 };
const EN = { group: ",", decimal: "." };

test("resolves a request only with a result of its own kind", async () => {
	const { worker, posted, reply } = fakeWorker();
	const client = new SheetWorkerClient(worker);
	const cells = client.request({
		type: "cells",
		sheet: 0,
		window: WINDOW,
		numbers: EN,
	});
	const id = posted[0]?.id ?? 0;
	reply({
		id,
		type: "search",
		ok: true,
		result: { matches: [], truncated: false },
	});
	await expect(cells).rejects.toBeInstanceOf(SheetWorkerError);

	const search = client.request({
		type: "search",
		sheet: 0,
		query: "a",
		caseSensitive: false,
		limit: 1,
		numbers: EN,
	});
	const result = { matches: [0, 0], truncated: false };
	reply({ id: posted[1]?.id ?? 0, type: "search", ok: true, result });
	expect(await search).toEqual(result);
});
