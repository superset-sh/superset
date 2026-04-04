import { describe, expect, test } from "bun:test";
import { convertPromptInputFiles } from "./convertFiles";

describe("convertPromptInputFiles", () => {
	test("passes through data URLs without fetching", async () => {
		const dataUrl = "data:text/plain;base64,aGVsbG8=";
		const result = await convertPromptInputFiles([
			{ url: dataUrl, mediaType: "text/plain", filename: "test.txt" },
		]);

		expect(result).toEqual([
			{ data: dataUrl, mediaType: "text/plain", filename: "test.txt" },
		]);
	});

	test("handles files without filename", async () => {
		const dataUrl = "data:image/png;base64,abc";
		const result = await convertPromptInputFiles([
			{ url: dataUrl, mediaType: "image/png" },
		]);

		expect(result).toEqual([
			{ data: dataUrl, mediaType: "image/png", filename: undefined },
		]);
	});

	test("handles multiple files", async () => {
		const result = await convertPromptInputFiles([
			{
				url: "data:text/plain;base64,YQ==",
				mediaType: "text/plain",
				filename: "a.txt",
			},
			{
				url: "data:text/plain;base64,Yg==",
				mediaType: "text/plain",
				filename: "b.txt",
			},
		]);

		expect(result).toHaveLength(2);
		expect(result[0].filename).toBe("a.txt");
		expect(result[1].filename).toBe("b.txt");
	});

	test("handles empty array", async () => {
		const result = await convertPromptInputFiles([]);
		expect(result).toEqual([]);
	});
});
