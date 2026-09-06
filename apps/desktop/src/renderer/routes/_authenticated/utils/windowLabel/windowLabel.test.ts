import { describe, expect, test } from "bun:test";
import { windowLabel } from "./windowLabel";

describe("windowLabel", () => {
	test("names both agents' account-wide windows the same way", () => {
		expect(windowLabel("five_hour")).toBe("5-hour window");
		expect(windowLabel("primary")).toBe("5-hour window");
		expect(windowLabel("seven_day")).toBe("weekly window");
		expect(windowLabel("secondary")).toBe("weekly window");
	});

	test("keeps the model name of a scoped weekly window", () => {
		expect(windowLabel("weekly_scoped:Fable")).toBe("Fable weekly window");
		expect(windowLabel("seven_day_sonnet")).toBe("Sonnet weekly window");
	});

	test("falls back to the id it was given", () => {
		expect(windowLabel("something_new")).toBe("something_new");
	});
});
