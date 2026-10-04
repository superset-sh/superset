import {
	openWorkbook,
	unreadableReason,
	type WorkbookModel,
} from "../workbookModel";
import type { SheetRequest, SheetResponse } from "./protocol";

let model: WorkbookModel | null = null;

function handle(request: SheetRequest): SheetResponse {
	const { id } = request;
	if (request.type === "open") {
		model = null;
		model = openWorkbook(request.source);
		return { id, type: "open", ok: true, result: model.sheets };
	}
	if (!model) throw new Error("No workbook is open");
	switch (request.type) {
		case "cells":
			return {
				id,
				type: "cells",
				ok: true,
				result: model.getCells(request.sheet, request.window, request.numbers),
			};
		case "search":
			return {
				id,
				type: "search",
				ok: true,
				result: model.search(
					request.sheet,
					request.query,
					request.caseSensitive,
					request.limit,
					request.numbers,
				),
			};
		case "tsv":
			return {
				id,
				type: "tsv",
				ok: true,
				result: model.rangeToTsv(request.sheet, request.range, request.numbers),
			};
	}
}

self.onmessage = (event: MessageEvent<SheetRequest>) => {
	const request = event.data;
	let response: SheetResponse;
	try {
		response = handle(request);
	} catch (error) {
		response = { id: request.id, ok: false, reason: unreadableReason(error) };
	}
	self.postMessage(response);
};
