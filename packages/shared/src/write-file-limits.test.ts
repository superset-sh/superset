import { describe, expect, test } from "bun:test";
import {
	MAX_WRITE_FILE_BASE64_LENGTH,
	MAX_WRITE_FILE_BYTES,
	writeFileContentSchema,
} from "./write-file-limits";

describe("writeFileContentSchema", () => {
	test("accepts text content at the limit", () => {
		const parsed = writeFileContentSchema.safeParse(
			"a".repeat(MAX_WRITE_FILE_BYTES),
		);

		expect(parsed.success).toBe(true);
	});

	test("rejects text content past the limit", () => {
		const parsed = writeFileContentSchema.safeParse(
			"a".repeat(MAX_WRITE_FILE_BYTES + 1),
		);

		expect(parsed.success).toBe(false);
		expect(JSON.stringify(parsed.error?.issues)).toContain(
			"Maximum size is 5MB",
		);
	});

	test("leaves room for a file of MAX_WRITE_FILE_BYTES to base64-encode", () => {
		const encoded = Buffer.alloc(MAX_WRITE_FILE_BYTES).toString("base64");

		expect(encoded.length).toBe(MAX_WRITE_FILE_BASE64_LENGTH);
		expect(
			writeFileContentSchema.safeParse({ kind: "base64", data: encoded })
				.success,
		).toBe(true);
	});

	test("rejects base64 content past the limit", () => {
		const parsed = writeFileContentSchema.safeParse({
			kind: "base64",
			data: "A".repeat(MAX_WRITE_FILE_BASE64_LENGTH + 1),
		});

		expect(parsed.success).toBe(false);
	});

	test("still accepts ordinary content", () => {
		expect(writeFileContentSchema.safeParse("hello world").success).toBe(true);
		expect(
			writeFileContentSchema.safeParse({ kind: "base64", data: "aGk=" })
				.success,
		).toBe(true);
	});
});
