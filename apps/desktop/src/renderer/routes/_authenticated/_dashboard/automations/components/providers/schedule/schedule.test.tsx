import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document. Process-wide, so this
// unregisters in afterAll to leave the other renderer suites their document.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { TriggerSentence } = await import("../../TriggerSentence");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

/**
 * What a scheduled row looks like, and must keep looking like.
 *
 * The cadence is fixed when the trigger is added — the Add Trigger menu is
 * where Hourly and Daily are chosen — so a row never offers to switch between
 * them, only to adjust the parameters of the one it is.
 *
 *     [word ▾]  a chip — a button you can open
 *      word     fixed wording, not a control
 *      [🗑]     remove, always last
 */

const TZ = "America/Los_Angeles";

async function row(rrule: string, props: Record<string, unknown> = {}) {
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<TriggerSentence
				trigger={
					{
						id: "t1",
						config: {
							kind: "schedule",
							rrule,
							dtstart: "2026-01-01T00:00:00.000Z",
							timezone: TZ,
						},
					} as never
				}
				onChange={() => {}}
				onRemove={() => {}}
				options={{}}
				{...props}
			/>,
		);
	});
	const ui = within(view.baseElement as HTMLElement);
	return {
		ui,
		view,
		chip: (name: string | RegExp) => ui.getByRole("button", { name }),
		queryChip: (name: string | RegExp) => ui.queryByRole("button", { name }),
		sentence: [...(view.container.firstElementChild?.children ?? [])]
			.map((child) => (child.textContent ?? "").replace(/\s+/g, " ").trim())
			.filter(Boolean)
			.join(" "),
	};
}

/**
 * Hourly — nothing to adjust, so nothing is openable:
 *
 *   🕐 Every hour                    Next run in 20 minutes   [🗑]
 */
describe("an hourly row", () => {
	test("says only that it runs every hour", async () => {
		const { sentence } = await row("FREQ=HOURLY");
		expect(sentence).toBe("Every hour");
	});

	// There is no hour or day to pick when it runs every hour.
	test("offers no time to adjust", async () => {
		const { ui } = await row("FREQ=HOURLY");
		const openable = ui
			.getAllByRole("button")
			.filter((b) => b.getAttribute("aria-label") !== "Remove trigger");
		expect(openable).toHaveLength(0);
	});

	test("carries the next run when the editor works one out", async () => {
		const { sentence } = await row("FREQ=HOURLY", {
			nextRun: "Next run in 20 minutes",
		});
		expect(sentence).toBe("Every hour Next run in 20 minutes");
	});
});

/**
 * Daily — one thing to adjust, and the zone it is fixed to:
 *
 *   🕐 Every day at [09:00 ▾] PST                              [🗑]
 */
describe("a daily row", () => {
	// P[DS]T rather than either one: the abbreviation follows the current date,
	// so pinning it would pass all summer and fail every November.
	test("names the hour it runs at, and the zone", async () => {
		const { sentence } = await row("FREQ=DAILY;BYHOUR=9;BYMINUTE=0");
		expect(sentence).toMatch(/^Every day at 09:00 P[DS]T$/);
	});

	test("lets the hour be changed", async () => {
		const { chip } = await row("FREQ=DAILY;BYHOUR=9;BYMINUTE=0");
		expect(chip("09:00")).toBeDefined();
	});

	// Read-only on purpose: the zone is captured when the trigger is created,
	// and rebinding it to whoever is looking would silently move the run.
	test("does not offer to change the zone", async () => {
		const { queryChip } = await row("FREQ=DAILY;BYHOUR=9;BYMINUTE=0");
		expect(queryChip(/^P[DS]T$/)).toBeNull();
	});

	// The list offers whole hours, but a rule written elsewhere (CLI, MCP) can
	// carry minutes, and that value has to stay selectable.
	test("keeps a non-whole hour written elsewhere", async () => {
		const { chip } = await row("FREQ=DAILY;BYHOUR=9;BYMINUTE=30");
		expect(chip("09:30")).toBeDefined();
	});
});

/**
 * Weekly — a day as well as an hour:
 *
 *   🕐 Every week on [Monday ▾] at [09:00 ▾] PST               [🗑]
 */
describe("a weekly row", () => {
	test("names the day and the hour", async () => {
		const { sentence } = await row("FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0");
		expect(sentence).toMatch(/^Every week on Monday at 09:00 P[DS]T$/);
	});

	test("lets the day be changed", async () => {
		const { chip } = await row("FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0");
		expect(chip("Monday")).toBeDefined();
	});
});

/**
 * Custom — the rule itself, typed:
 *
 *   🕐 Custom schedule [FREQ=WEEKLY;BYDAY=MO,TU… ]              [🗑]
 */
describe("a custom row", () => {
	const CUSTOM = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0";

	test("shows the rule for editing rather than a sentence", async () => {
		const { ui } = await row(CUSTOM);
		expect(ui.getByText("Custom schedule")).toBeDefined();
		expect((ui.getByRole("textbox") as HTMLInputElement).value).toBe(CUSTOM);
	});

	// The error takes the "Next run" slot rather than a second line: a rule
	// that will not save has no next run, and showing both reads as a
	// contradiction.
	test("replaces the next run with the reason it will not save", async () => {
		const { ui, view } = await row(CUSTOM, { nextRun: "Next run Friday" });
		await act(async () => {
			fireEvent.change(ui.getByRole("textbox"), {
				target: { value: "FREQ=NONSENSE" },
			});
		});
		const text = view.container.textContent ?? "";
		expect(text).toContain("Invalid recurrence rule — changes aren't saved");
		expect(text).not.toContain("Next run Friday");
	});

	// Clearing the field is an edit that cannot save, but an empty rule has no
	// parse error to report — without this it sat blank under the old next run.
	test("says so when the rule is cleared rather than left invalid", async () => {
		const { ui, view } = await row(CUSTOM, { nextRun: "Next run Friday" });
		await act(async () => {
			fireEvent.change(ui.getByRole("textbox"), { target: { value: "" } });
		});
		const text = view.container.textContent ?? "";
		expect(text).toContain("Enter a recurrence rule — changes aren't saved");
		expect(text).not.toContain("Next run Friday");
	});

	// A saved rule can be exhausted (a run-once schedule that already ran);
	// that is history, not an edit gone wrong, so it is not complained about.
	test("does not complain about the saved rule until it is edited", async () => {
		const { view } = await row(CUSTOM, { nextRun: "Next run Friday" });
		const text = view.container.textContent ?? "";
		expect(text).toContain("Next run Friday");
		expect(text).not.toContain("aren't saved");
	});
});

describe("a scheduled row that cannot be edited", () => {
	test("disables every control", async () => {
		const { ui } = await row("FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0", {
			disabled: true,
		});
		for (const button of ui.getAllByRole("button")) {
			expect((button as HTMLButtonElement).disabled).toBe(true);
		}
	});
});

/**
 * A schedule needs no integration, so it never collapses the way a provider
 * row does — there is nothing to connect.
 */
describe("a scheduled row never asks for a connection", () => {
	test("keeps its sentence and its remove button", async () => {
		const { sentence, ui } = await row("FREQ=HOURLY");
		expect(sentence).toBe("Every hour");
		expect(ui.getByLabelText("Remove trigger")).toBeDefined();
	});
});

/**
 * The row is one line, not a stack:
 *
 *   🕐 Every week on [Monday ▾] at [09:00 ▾] PDT   Next run …   [🗑]
 *
 * Every other provider's sentence renders as a fragment, so its words are
 * siblings of the row's icon and wrap with it. A schedule that wrapped itself
 * in a div became one flex item that could not share a line with the icon, and
 * the row stacked into four.
 */
describe("a scheduled row's parts sit on the row itself", () => {
	test("the sentence is not boxed away from the icon", async () => {
		const { view } = await row("FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0");
		const parts = [...(view.container.firstElementChild?.children ?? [])];
		// icon + "Every week" + "on" + day + "at" + time + zone + remove
		expect(parts.length).toBeGreaterThanOrEqual(7);
	});

	test("the icon leads the row rather than owning a line", async () => {
		const { view } = await row("FREQ=HOURLY");
		expect(view.container.firstElementChild?.firstElementChild?.tagName).toBe(
			"svg",
		);
	});
});

/**
 * The cadence is chosen once, in the Add Trigger menu. A row never offers to
 * become a different one — switching Weekly to Hourly would silently discard
 * the day and hour it was carrying.
 */
describe("a scheduled row cannot change cadence", () => {
	test("offers no way to become hourly or daily", async () => {
		const { queryChip } = await row("FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0");
		expect(queryChip(/Hourly|Daily|Weekly|Custom/)).toBeNull();
	});

	// "Would run" was dropped: the row says when it runs next, not what it
	// would hypothetically do.
	test("does not hedge about whether it runs", async () => {
		const { view } = await row("FREQ=HOURLY", {
			nextRun: "Next run in 20 minutes",
		});
		expect(view.container.textContent ?? "").not.toContain("Would run");
	});
});
