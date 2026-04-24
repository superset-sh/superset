import { describe, expect, it } from "bun:test";
import { newAttachmentId, stripDataUrlPrefix } from "./attachments";

describe("stripDataUrlPrefix", () => {
	it("strips a valid data URL prefix", () => {
		expect(stripDataUrlPrefix("data:image/png;base64,ABC123")).toBe("ABC123");
		expect(stripDataUrlPrefix("data:image/jpeg;base64,ZZ")).toBe("ZZ");
	});

	it("passes through input without a prefix", () => {
		expect(stripDataUrlPrefix("already-base64-data")).toBe(
			"already-base64-data",
		);
	});

	it("passes through non-base64 data URLs", () => {
		expect(stripDataUrlPrefix("data:text/plain,hello world")).toBe(
			"data:text/plain,hello world",
		);
	});
});

describe("newAttachmentId", () => {
	it("returns a unique-ish id each call", () => {
		const a = newAttachmentId();
		const b = newAttachmentId();
		expect(a).toMatch(/^att-/);
		expect(b).toMatch(/^att-/);
		expect(a).not.toBe(b);
	});
});
