import { describe, expect, it } from "bun:test";
import {
	buildRrule,
	describeSchedule,
	formatDateTimeInTimezone,
	matchPreset,
	nextOccurrences,
	type PresetMatch,
	parseRrule,
} from "./rrule";

const US = { locale: "en-US" };

function expectDateTimeParts(
	formatted: string,
	expected: {
		month: string;
		day: string;
		year: string;
		hour: string;
		minute: string;
		dayPeriod?: string;
		timeZoneName: string;
	},
): void {
	for (const value of Object.values(expected)) {
		expect(formatted).toContain(value);
	}
}

describe("describeSchedule / MINUTELY + HOURLY", () => {
	it("every minute", () => {
		expect(describeSchedule("FREQ=MINUTELY", US)).toBe("Every minute");
	});

	it("every N minutes", () => {
		expect(describeSchedule("FREQ=MINUTELY;INTERVAL=15", US)).toBe(
			"Every 15 minutes",
		);
	});

	it("hourly", () => {
		expect(describeSchedule("FREQ=HOURLY", US)).toBe("Hourly");
	});

	it("every N hours", () => {
		expect(describeSchedule("FREQ=HOURLY;INTERVAL=2", US)).toBe(
			"Every 2 hours",
		);
	});
});

describe("describeSchedule / DAILY", () => {
	it("daily with time", () => {
		expect(describeSchedule("FREQ=DAILY;BYHOUR=9;BYMINUTE=0", US)).toBe(
			"Daily at 9:00 AM",
		);
	});

	it("daily without time", () => {
		expect(describeSchedule("FREQ=DAILY", US)).toBe("Daily");
	});

	it("every N days", () => {
		expect(describeSchedule("FREQ=DAILY;INTERVAL=3;BYHOUR=8", US)).toBe(
			"Every 3 days at 8:00 AM",
		);
	});
});

describe("describeSchedule / WEEKLY", () => {
	it("weekdays with time", () => {
		expect(
			describeSchedule(
				"FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
				US,
			),
		).toBe("Weekdays at 9:00 AM");
	});

	it("weekdays regardless of BYDAY order", () => {
		expect(describeSchedule("FREQ=WEEKLY;BYDAY=FR,TH,WE,TU,MO", US)).toBe(
			"Weekdays",
		);
	});

	it("weekends", () => {
		expect(describeSchedule("FREQ=WEEKLY;BYDAY=SA,SU", US)).toBe("Weekends");
	});

	it("single day pluralized", () => {
		expect(
			describeSchedule("FREQ=WEEKLY;BYDAY=MO;BYHOUR=10;BYMINUTE=0", US),
		).toBe("Mondays at 10:00 AM");
	});

	it("multi-day list keeps canonical order", () => {
		expect(describeSchedule("FREQ=WEEKLY;BYDAY=FR,MO,WE", US)).toBe(
			"Mon, Wed, Fri",
		);
	});

	it("every 2 weeks on a specific day", () => {
		expect(
			describeSchedule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;BYHOUR=9", US),
		).toBe("Every 2 weeks on Monday at 9:00 AM");
	});

	it("every 2 weeks with multiple days → Custom", () => {
		expect(describeSchedule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE", US)).toBe(
			"Custom",
		);
	});
});

describe("describeSchedule / MONTHLY + YEARLY", () => {
	it("first of each month", () => {
		expect(describeSchedule("FREQ=MONTHLY;BYMONTHDAY=1", US)).toBe(
			"Monthly on the 1st",
		);
	});

	it("ordinal suffixes use correct teens", () => {
		expect(describeSchedule("FREQ=MONTHLY;BYMONTHDAY=11", US)).toBe(
			"Monthly on the 11th",
		);
		expect(describeSchedule("FREQ=MONTHLY;BYMONTHDAY=22", US)).toBe(
			"Monthly on the 22nd",
		);
		expect(describeSchedule("FREQ=MONTHLY;BYMONTHDAY=23", US)).toBe(
			"Monthly on the 23rd",
		);
	});

	it("last day of month", () => {
		expect(describeSchedule("FREQ=MONTHLY;BYMONTHDAY=-1", US)).toBe(
			"Last day of each month",
		);
	});

	it("annually", () => {
		expect(describeSchedule("FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1", US)).toBe(
			"Annually on January 1",
		);
	});
});

describe("describeSchedule / locale", () => {
	it("renders 24h time when the locale asks for it", () => {
		expect(
			describeSchedule("FREQ=DAILY;BYHOUR=9;BYMINUTE=0", {
				locale: "en-GB",
			}),
		).toBe("Daily at 9:00");
	});
});

describe("describeSchedule / fallback to Custom", () => {
	it("returns Custom for BYSETPOS", () => {
		expect(describeSchedule("FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1", US)).toBe(
			"Custom",
		);
	});

	it("returns Custom for COUNT", () => {
		expect(describeSchedule("FREQ=DAILY;COUNT=5", US)).toBe("Custom");
	});

	it("returns Custom for UNTIL", () => {
		expect(describeSchedule("FREQ=DAILY;UNTIL=20260101T000000Z", US)).toBe(
			"Custom",
		);
	});

	it("returns Custom for empty or malformed rules", () => {
		expect(describeSchedule("", US)).toBe("Custom");
		expect(describeSchedule("FREQ", US)).toBe("Custom");
		expect(describeSchedule("NOTAKEY=VALUE", US)).toBe("Custom");
	});
});

describe("matchPreset", () => {
	it("recognizes hourly", () => {
		expect(matchPreset("FREQ=HOURLY")).toEqual({ kind: "hourly" });
	});

	it("recognizes daily with time", () => {
		expect(matchPreset("FREQ=DAILY;BYHOUR=9;BYMINUTE=0")).toEqual({
			kind: "daily",
			hour: 9,
			minute: 0,
		});
	});

	it("recognizes weekdays with time", () => {
		expect(
			matchPreset("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=30"),
		).toEqual({ kind: "weekdays", hour: 9, minute: 30 });
	});

	it("recognizes weekly on a specific day", () => {
		expect(matchPreset("FREQ=WEEKLY;BYDAY=MO;BYHOUR=10;BYMINUTE=0")).toEqual({
			kind: "weekly",
			day: "MO",
			hour: 10,
			minute: 0,
		});
	});

	it("treats BYDAY order insensitively for weekdays", () => {
		expect(
			matchPreset("FREQ=WEEKLY;BYDAY=FR,TH,WE,TU,MO;BYHOUR=9"),
		).toMatchObject({ kind: "weekdays" });
	});

	it("falls through to custom when INTERVAL>1", () => {
		expect(matchPreset("FREQ=DAILY;INTERVAL=2;BYHOUR=9")).toMatchObject({
			kind: "custom",
		});
	});

	it("falls through to custom for MONTHLY / YEARLY", () => {
		expect(matchPreset("FREQ=MONTHLY;BYMONTHDAY=1")).toMatchObject({
			kind: "custom",
		});
		expect(matchPreset("FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1")).toMatchObject({
			kind: "custom",
		});
	});

	it("falls through to custom for weekends or multi-day-not-weekdays", () => {
		expect(matchPreset("FREQ=WEEKLY;BYDAY=SA,SU;BYHOUR=9")).toMatchObject({
			kind: "custom",
		});
		expect(matchPreset("FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=9")).toMatchObject({
			kind: "custom",
		});
	});

	it("hourly with BYHOUR → custom (our hourly preset takes no time)", () => {
		expect(matchPreset("FREQ=HOURLY;BYHOUR=9")).toMatchObject({
			kind: "custom",
		});
	});

	it("daily without BYHOUR → custom (our daily preset requires time)", () => {
		expect(matchPreset("FREQ=DAILY")).toMatchObject({ kind: "custom" });
	});

	it("preserves the original rrule on custom fallback", () => {
		const input = "FREQ=MONTHLY;BYMONTHDAY=15;BYHOUR=8";
		expect(matchPreset(input)).toEqual({ kind: "custom", rrule: input });
	});
});

describe("buildRrule", () => {
	it("emits hourly", () => {
		expect(buildRrule({ kind: "hourly" })).toBe("FREQ=HOURLY");
	});

	it("emits daily with time", () => {
		expect(buildRrule({ kind: "daily", hour: 9, minute: 0 })).toBe(
			"FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
		);
	});

	it("emits weekdays with time", () => {
		expect(buildRrule({ kind: "weekdays", hour: 9, minute: 30 })).toBe(
			"FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=30",
		);
	});

	it("emits weekly with a specific day", () => {
		expect(buildRrule({ kind: "weekly", day: "FR", hour: 15, minute: 0 })).toBe(
			"FREQ=WEEKLY;BYDAY=FR;BYHOUR=15;BYMINUTE=0",
		);
	});

	it("emits the raw rrule for custom", () => {
		expect(
			buildRrule({ kind: "custom", rrule: "FREQ=MONTHLY;BYMONTHDAY=15" }),
		).toBe("FREQ=MONTHLY;BYMONTHDAY=15");
	});
});

describe("matchPreset + buildRrule round-trip", () => {
	const cases: PresetMatch[] = [
		{ kind: "hourly" },
		{ kind: "daily", hour: 9, minute: 0 },
		{ kind: "daily", hour: 23, minute: 45 },
		{ kind: "weekdays", hour: 8, minute: 30 },
		{ kind: "weekly", day: "MO", hour: 10, minute: 0 },
		{ kind: "weekly", day: "SU", hour: 18, minute: 15 },
	];

	for (const match of cases) {
		it(`${JSON.stringify(match)}`, () => {
			const rrule = buildRrule(match);
			expect(matchPreset(rrule)).toEqual(match);
		});
	}
});

describe("recurrence timezone math", () => {
	it("computes daily wall-clock times as plain UTC Date instances", () => {
		const next = parseRrule({
			rrule: "FREQ=DAILY;BYHOUR=6;BYMINUTE=0",
			dtstart: new Date("2026-04-24T20:00:00.000Z"),
			timezone: "America/Los_Angeles",
			after: new Date("2026-04-25T00:00:00.000Z"),
		}).nextRunAt;

		expect(next.constructor.name).toBe("Date");
		expect(next.toISOString()).toBe("2026-04-25T13:00:00.000Z");
		expectDateTimeParts(
			formatDateTimeInTimezone(next, "America/Los_Angeles", {
				locale: "en-US",
			}),
			{
				month: "Apr",
				day: "25",
				year: "2026",
				hour: "6",
				minute: "00",
				dayPeriod: "AM",
				timeZoneName: "PDT",
			},
		);
	});

	it("keeps the same local time across daylight saving changes", () => {
		const runs = nextOccurrences({
			rrule: "FREQ=DAILY;BYHOUR=6;BYMINUTE=0",
			dtstart: new Date("2026-03-06T20:00:00.000Z"),
			timezone: "America/Los_Angeles",
			after: new Date("2026-03-07T00:00:00.000Z"),
			count: 3,
		});

		expect(runs.map((run) => run.toISOString())).toEqual([
			"2026-03-07T14:00:00.000Z",
			"2026-03-08T13:00:00.000Z",
			"2026-03-09T13:00:00.000Z",
		]);
		const formattedRuns = runs.map((run) =>
			formatDateTimeInTimezone(run, "America/Los_Angeles", {
				locale: "en-US",
			}),
		);
		expectDateTimeParts(formattedRuns[0] ?? "", {
			month: "Mar",
			day: "7",
			year: "2026",
			hour: "6",
			minute: "00",
			dayPeriod: "AM",
			timeZoneName: "PST",
		});
		expectDateTimeParts(formattedRuns[1] ?? "", {
			month: "Mar",
			day: "8",
			year: "2026",
			hour: "6",
			minute: "00",
			dayPeriod: "AM",
			timeZoneName: "PDT",
		});
		expectDateTimeParts(formattedRuns[2] ?? "", {
			month: "Mar",
			day: "9",
			year: "2026",
			hour: "6",
			minute: "00",
			dayPeriod: "AM",
			timeZoneName: "PDT",
		});
	});

	it("falls back to UTC formatting for invalid legacy timezone values", () => {
		const formatted = formatDateTimeInTimezone(
			new Date("2026-04-25T13:00:00.000Z"),
			"Invalid/Timezone",
			{ locale: "en-US" },
		);

		expectDateTimeParts(formatted, {
			month: "Apr",
			day: "25",
			year: "2026",
			hour: "1",
			minute: "00",
			dayPeriod: "PM",
			timeZoneName: "UTC",
		});
	});
});
