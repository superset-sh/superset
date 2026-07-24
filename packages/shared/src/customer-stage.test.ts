import { describe, expect, test } from "bun:test";

import { stageFromUserCount } from "./customer-stage";

describe("stageFromUserCount", () => {
	test("tiers by user count", () => {
		expect(stageFromUserCount(1)).toBe("solo");
		expect(stageFromUserCount(2)).toBe("team");
		expect(stageFromUserCount(9)).toBe("team");
		expect(stageFromUserCount(10)).toBe("scale");
		expect(stageFromUserCount(49)).toBe("scale");
		expect(stageFromUserCount(50)).toBe("enterprise");
		expect(stageFromUserCount(354)).toBe("enterprise");
	});

	test("enterprise plan forces enterprise tier", () => {
		expect(stageFromUserCount(1, true)).toBe("enterprise");
		expect(stageFromUserCount(12, true)).toBe("enterprise");
	});
});
