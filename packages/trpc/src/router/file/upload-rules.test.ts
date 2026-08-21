import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import {
	FILE_CONTENT_TYPES,
	MAX_UPLOAD_BYTES,
	validateFileUpload,
} from "./upload-rules";

const base64 = (text: string) => Buffer.from(text).toString("base64");

describe("FILE_CONTENT_TYPES", () => {
	test("is the four image types, and nothing that could be a page", () => {
		expect([...FILE_CONTENT_TYPES].sort()).toEqual([
			"image/gif",
			"image/jpeg",
			"image/png",
			"image/svg+xml",
		]);
	});
});

describe("validateFileUpload", () => {
	test("accepts an image and returns its digest", () => {
		const { buffer, sha256 } = validateFileUpload({
			content: base64("\x89PNG\r\n"),
			contentType: "image/png",
		});
		expect(buffer.length).toBeGreaterThan(0);
		expect(sha256).toHaveLength(64);
	});

	test("accepts svg — safe as an <img> source on the blob origin", () => {
		expect(() =>
			validateFileUpload({
				content: base64("<svg xmlns='http://www.w3.org/2000/svg'/>"),
				contentType: "image/svg+xml",
			}),
		).not.toThrow();
	});

	test("rejects html, which the files_never_a_page CHECK also forbids", () => {
		expect(() =>
			validateFileUpload({
				content: base64("<h1>hi</h1>"),
				contentType: "text/html",
			}),
		).toThrow(TRPCError);
	});

	test("rejects a type outside the allowlist", () => {
		expect(() =>
			validateFileUpload({
				content: base64("%PDF-"),
				contentType: "application/pdf",
			}),
		).toThrow(TRPCError);
	});

	test("rejects a file over the cap", () => {
		expect(() =>
			validateFileUpload({
				content: Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x61).toString("base64"),
				contentType: "image/png",
			}),
		).toThrow(/too large/i);
	});
});
