import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { decodeBase64Content, validateUploadBytes } from "./upload-bytes";

const base64 = (text: string) => Buffer.from(text).toString("base64");
const allowed = new Set(["text/html", "image/png"]);
const maxBytes = 1024;

describe("decodeBase64Content", () => {
	test("decodes a bare base64 payload", () => {
		expect(decodeBase64Content(base64("<h1>hi</h1>")).toString()).toBe(
			"<h1>hi</h1>",
		);
	});

	test("strips a data: URL prefix", () => {
		const dataUrl = `data:text/html;base64,${base64("<h1>hi</h1>")}`;
		expect(decodeBase64Content(dataUrl).toString()).toBe("<h1>hi</h1>");
	});
});

describe("validateUploadBytes", () => {
	test("returns the decoded bytes and their digest", () => {
		const { buffer, sha256 } = validateUploadBytes({
			content: base64("hello"),
			contentType: "text/html",
			allowed,
			maxBytes,
		});
		expect(buffer.toString()).toBe("hello");
		expect(sha256).toBe(
			"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		);
	});

	test("rejects a content type outside the allowlist", () => {
		expect(() =>
			validateUploadBytes({
				content: base64("<svg/>"),
				contentType: "image/svg+xml",
				allowed,
				maxBytes,
			}),
		).toThrow(TRPCError);
	});

	test("rejects an empty payload", () => {
		expect(() =>
			validateUploadBytes({
				content: "",
				contentType: "text/html",
				allowed,
				maxBytes,
			}),
		).toThrow(/empty/);
	});

	test("rejects a payload over the cap", () => {
		expect(() =>
			validateUploadBytes({
				content: Buffer.alloc(maxBytes + 1, 0x61).toString("base64"),
				contentType: "text/html",
				allowed,
				maxBytes,
			}),
		).toThrow(/too large/i);
	});

	test("rejects an oversized payload without decoding it", () => {
		const huge = "A".repeat(maxBytes * 8);
		expect(() =>
			validateUploadBytes({
				content: huge,
				contentType: "text/html",
				allowed,
				maxBytes,
			}),
		).toThrow(/too large/i);
	});

	test("does not reject a payload that only looks large once encoded", () => {
		const atCap = Buffer.alloc(maxBytes, 0x61).toString("base64");
		expect(atCap.length).toBeGreaterThan(maxBytes);
		expect(
			validateUploadBytes({
				content: atCap,
				contentType: "text/html",
				allowed,
				maxBytes,
			}).buffer.length,
		).toBe(maxBytes);
	});

	test("accepts a payload exactly at the cap", () => {
		expect(
			validateUploadBytes({
				content: Buffer.alloc(maxBytes, 0x61).toString("base64"),
				contentType: "text/html",
				allowed,
				maxBytes,
			}).buffer.length,
		).toBe(maxBytes);
	});
});
