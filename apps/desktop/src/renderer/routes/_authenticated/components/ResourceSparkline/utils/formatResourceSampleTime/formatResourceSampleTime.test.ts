import { expect, test } from "bun:test";
import { formatDate } from "@superset/i18n/format";
import { formatResourceSampleTime } from "./formatResourceSampleTime";

test("chart tooltip uses the sample timestamp, not its configured text label", () => {
	const at = Date.UTC(2026, 8, 18, 12, 34, 56);
	const expected = formatDate(new Date(at), {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	for (const label of [
		"Superset CPU · last 5 min",
		"Superset memory · last 5 min",
		undefined,
	]) {
		expect(formatResourceSampleTime(label, [{ payload: { at } }])).toBe(
			expected,
		);
	}
});

test("missing or invalid samples cannot crash tooltip rendering", () => {
	expect(formatResourceSampleTime("CPU", [])).toBeNull();
	expect(formatResourceSampleTime("CPU", [{}])).toBeNull();
	for (const at of [
		undefined,
		null,
		"invalid",
		NaN,
		Infinity,
		-Infinity,
		1e20,
	]) {
		expect(formatResourceSampleTime("CPU", [{ payload: { at } }])).toBeNull();
	}
});
