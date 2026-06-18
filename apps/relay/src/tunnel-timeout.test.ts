import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("relay tunnel timeout policy", () => {
	test("keeps HTTP tunnel requests long enough for Automation startup", () => {
		const source = readFileSync(join(import.meta.dirname, "tunnel.ts"), "utf8");

		expect(source).toContain("const HTTP_REQUEST_TIMEOUT_MS = 120_000");
		expect(source).toContain(
			"constructor(requestTimeoutMs = HTTP_REQUEST_TIMEOUT_MS)",
		);
	});
});
