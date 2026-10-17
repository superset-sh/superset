import { describe, expect, test } from "bun:test";
import { resolveSnoozePresets } from "./snoozePresets";

function presetsAt(date: Date) {
	return Object.fromEntries(
		resolveSnoozePresets(date).map((preset) => [
			preset.id,
			new Date(preset.until),
		]),
	);
}

describe("resolveSnoozePresets", () => {
	test("offers this evening and next Monday on a weekday morning", () => {
		const wednesday = new Date(2026, 9, 14, 10, 30);
		const presets = presetsAt(wednesday);
		expect(presets["in-1-hour"]).toEqual(new Date(2026, 9, 14, 11, 30));
		expect(presets["in-3-hours"]).toEqual(new Date(2026, 9, 14, 13, 30));
		expect(presets["this-evening"]).toEqual(new Date(2026, 9, 14, 18));
		expect(presets.tomorrow).toEqual(new Date(2026, 9, 15, 9));
		expect(presets["next-week"]).toEqual(new Date(2026, 9, 19, 9));
	});

	test("drops this evening within an hour of it", () => {
		const late = new Date(2026, 9, 14, 17, 30);
		expect(presetsAt(late)["this-evening"]).toBeUndefined();
	});

	test("next week on a Monday is the Monday after", () => {
		const monday = new Date(2026, 9, 12, 10);
		expect(presetsAt(monday)["next-week"]).toEqual(new Date(2026, 9, 19, 9));
	});

	test("drops next week on a Sunday, where it equals tomorrow", () => {
		const sunday = new Date(2026, 9, 18, 10);
		const presets = presetsAt(sunday);
		expect(presets.tomorrow).toEqual(new Date(2026, 9, 19, 9));
		expect(presets["next-week"]).toBeUndefined();
	});
});
