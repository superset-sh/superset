import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("desktop host-service entry imports", () => {
	test("loads host-service implementation through narrow subpaths", () => {
		const source = readFileSync(join(import.meta.dir, "index.ts"), "utf8");

		expect(source).not.toContain('import("@superset/host-service")');
		expect(source).toContain('import("@superset/host-service/app")');
		expect(source).toContain('import("@superset/host-service/providers/auth")');
		expect(source).toContain('import("@superset/host-service/safety")');
	});
});
