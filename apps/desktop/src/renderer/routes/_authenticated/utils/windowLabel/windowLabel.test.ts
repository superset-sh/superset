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

	// Codex builds these ids from its own limit_name, so the name is right
	// there in the id — leaving it whole showed the user "additional:gpt-5-high".
	test("names a Codex extra limit by the provider's own name", () => {
		expect(windowLabel("additional:gpt-5-high")).toBe("gpt-5-high");
	});

	// An unnamed extra limit still has to name something: both callers read
	// "<label> at <percent>", and an empty label leaves " at 91%".
	test("keeps the id when a Codex extra limit has no name", () => {
		expect(windowLabel("additional:")).toBe("additional:");
	});

	test("falls back to the id it was given", () => {
		expect(windowLabel("something_new")).toBe("something_new");
	});
});
