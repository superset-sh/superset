import { describe, expect, test } from "bun:test";
import { classifyUpdateTarget } from "./version";

describe("host update versions", () => {
	test("classifies targets with shared publication ordering", () => {
		expect(classifyUpdateTarget("1.14.0-1", "1.14.0-1")).toBe("satisfied");
		expect(classifyUpdateTarget("1.14.0", "1.14.0-1")).toBe("upgrade");
		expect(classifyUpdateTarget("1.14.0-1", "1.14.0")).toBe("downgrade");
		expect(classifyUpdateTarget("1.14.0-2", "1.14.0-1")).toBe("downgrade");
	});
});
