import { describe, expect, test } from "bun:test";
import { FILE_PATH_MIME, setFileDragData } from "./setFileDragData";

function fakeDataTransfer() {
	const data = new Map<string, string>();
	return {
		data,
		effectAllowed: "uninitialized",
		setData: (type: string, value: string) => data.set(type, value),
	} as unknown as DataTransfer & { data: Map<string, string> };
}

describe("setFileDragData", () => {
	test("overwrites a tree-relative text/plain with the absolute path", () => {
		const dt = fakeDataTransfer();
		dt.setData("text/plain", "src/");
		setFileDragData(dt, "/repo/src", "copyMove");
		expect(dt.data.get("text/plain")).toBe("/repo/src");
		expect(dt.data.get(FILE_PATH_MIME)).toBe("/repo/src");
		expect(dt.effectAllowed).toBe("copyMove");
	});
});
