import { describe, expect, test } from "bun:test";
import { sniffContentType } from "./sniff";

const bytes = (...values: (number | string)[]): Uint8Array => {
	const out: number[] = [];
	for (const v of values) {
		if (typeof v === "number") out.push(v);
		else for (const ch of v) out.push(ch.charCodeAt(0));
	}
	return new Uint8Array(out);
};

describe("sniffContentType", () => {
	test("binary signatures beat any declaration", () => {
		expect(sniffContentType(bytes(0x89, "PNG"), "text/html")).toBe("image/png");
		expect(sniffContentType(bytes("%PDF-1.7"), "image/png")).toBe(
			"application/pdf",
		);
		expect(
			sniffContentType(bytes(0, 0, 0, 24, "ftypisom", 0, 0, 0, 0), "image/png"),
		).toBe("video/mp4");
		expect(
			sniffContentType(bytes(0, 0, 0, 24, "ftypqt  ", 0, 0, 0, 0), "video/mp4"),
		).toBe("video/quicktime");
	});

	test("html masquerading as an image is named html", () => {
		expect(sniffContentType(bytes("<!DOCTYPE html><html>"), "image/png")).toBe(
			"text/html",
		);
		expect(
			sniffContentType(bytes("  <script>alert(1)</script>"), "text/plain"),
		).toBe("text/html");
	});

	test("svg is svg regardless of declaration", () => {
		expect(sniffContentType(bytes('<svg xmlns="x">'), "image/png")).toBe(
			"image/svg+xml",
		);
		expect(
			sniffContentType(bytes('<?xml version="1.0"?><svg>'), "text/plain"),
		).toBe("image/svg+xml");
	});

	test("plain text keeps a non-scriptable declared text type", () => {
		expect(sniffContentType(bytes("a,b,c\n1,2,3"), "text/csv")).toBe(
			"text/csv",
		);
		expect(sniffContentType(bytes("hello"), "text/html")).toBe("text/plain");
		expect(sniffContentType(bytes('{"a":1}'), "text/plain")).toBe(
			"application/json",
		);
	});

	test("unknown binary never keeps a scriptable declaration", () => {
		const blob = new Uint8Array([0x00, 0x01, 0x02, 0xfe]);
		expect(sniffContentType(blob, "text/html")).toBe(
			"application/octet-stream",
		);
		expect(sniffContentType(blob, "application/vnd.sqlite3")).toBe(
			"application/vnd.sqlite3",
		);
		expect(sniffContentType(new Uint8Array(), "video/mp4")).toBe(
			"application/octet-stream",
		);
	});
});
