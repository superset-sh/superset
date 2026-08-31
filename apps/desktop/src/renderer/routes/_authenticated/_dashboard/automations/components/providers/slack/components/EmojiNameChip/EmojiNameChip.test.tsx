import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
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
const { EmojiNameChip } = await import("./EmojiNameChip");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

/**
 * The reaction picker, open:
 *
 *   [✅ ▾]
 *   ┌──────────────────────┐
 *   │ No reaction          │   ← only where clearing is a choice
 *   │ ✅                   │   ← the canonical default
 *   │ [:custom_emoji_name:]│   ← anything else, typed
 *   └──────────────────────┘
 *
 * Slack has no API listing standard emoji, and a workspace's custom ones are
 * the ones people most want to react with, so a full picker would always be
 * missing the one that matters. The rows cover none and the default; typing
 * takes over the selection.
 */
async function chip(props: Partial<Parameters<typeof EmojiNameChip>[0]> = {}) {
	const onChange = mock((_next: string[]) => {});
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<EmojiNameChip
				names={[]}
				onChange={onChange}
				emptyLabel="No reaction"
				placeholder=":custom_emoji_name:"
				noneLabel="No reaction"
				defaultName="white_check_mark"
				{...props}
			/>,
		);
	});
	const ui = within(view.baseElement as HTMLElement);
	const label = () => ui.getAllByRole("button")[0]?.textContent ?? "";
	const open = async () => {
		await act(async () => {
			ui.getAllByRole("button")[0]?.click();
		});
		return ui;
	};
	return { ui, onChange, label, open };
}

describe("the reaction chip, closed", () => {
	test("shows the glyph of a known reaction", async () => {
		const { label } = await chip({ names: ["white_check_mark"] });
		expect(label()).toContain("✅");
	});

	// A workspace's custom emoji have no glyph and read as :name:.
	test("shows a custom reaction by name", async () => {
		const { label } = await chip({ names: ["shipit"] });
		expect(label()).toContain(":shipit:");
	});

	test("counts several", async () => {
		const { label } = await chip({ names: ["eyes", "bug"] });
		expect(label()).toContain("2 reactions");
	});

	test("says so when there is none", async () => {
		const { label } = await chip({ names: [] });
		expect(label()).toContain("No reaction");
	});
});

describe("the reaction chip, open", () => {
	test("offers to clear the reaction", async () => {
		const { open } = await chip({ names: ["white_check_mark"] });
		const ui = await open();
		expect(ui.getAllByText("No reaction").length).toBeGreaterThan(0);
	});

	test("offers the canonical default", async () => {
		const { open } = await chip({ names: [] });
		const ui = await open();
		expect(ui.getByText("✅")).toBeDefined();
	});

	test("invites anything else to be typed", async () => {
		const { open } = await chip({ names: [] });
		const ui = await open();
		expect(ui.getByPlaceholderText(":custom_emoji_name:")).toBeDefined();
	});

	test("clearing selects nothing", async () => {
		const { open, onChange, ui } = await chip({ names: ["white_check_mark"] });
		await open();
		const none = ui
			.getAllByText("No reaction")
			.find((el) => el.tagName === "BUTTON" || el.closest("button"));
		await act(async () => {
			(none?.closest("button") ?? none)?.dispatchEvent(
				new MouseEvent("click", { bubbles: true }),
			);
		});
		expect(onChange).toHaveBeenCalledWith([]);
	});
});

describe("typing a reaction", () => {
	// Live, not on close: the chip has to follow what is being typed, which is
	// the only feedback that the name was understood.
	test("updates the selection as it is typed", async () => {
		const { open, onChange, ui } = await chip({ names: [] });
		await open();
		await act(async () => {
			fireEvent.change(ui.getByPlaceholderText(":custom_emoji_name:"), {
				target: { value: "af" },
			});
		});
		expect(onChange).toHaveBeenCalledWith(["af"]);
	});

	// Colons and commas are optional on the way in — people paste ":bug:" as
	// readily as they type "bug".
	test("accepts a name with colons around it", async () => {
		const { open, onChange, ui } = await chip({ names: [] });
		await open();
		await act(async () => {
			fireEvent.change(ui.getByPlaceholderText(":custom_emoji_name:"), {
				target: { value: ":bug:" },
			});
		});
		expect(onChange).toHaveBeenCalledWith(["bug"]);
	});

	test("accepts several at once", async () => {
		const { open, onChange, ui } = await chip({ names: [] });
		await open();
		await act(async () => {
			fireEvent.change(ui.getByPlaceholderText(":custom_emoji_name:"), {
				target: { value: "bug, eyes" },
			});
		});
		expect(onChange).toHaveBeenCalledWith(["bug", "eyes"]);
	});
});

/**
 * The emoji slot of a reaction trigger has no "none" and no default — a
 * reaction trigger has to name its reaction, so there is nothing to clear it
 * to, only the field.
 */
describe("the reaction chip where a reaction is required", () => {
	const required = () =>
		chip({
			names: [],
			emptyLabel: "Select emoji",
			placeholder: ":bug: or bug, eyes",
			noneLabel: undefined,
			defaultName: undefined,
		});

	test("asks for one", async () => {
		const { label } = await required();
		expect(label()).toContain("Select emoji");
	});

	test("offers no way to clear it", async () => {
		const { open } = await required();
		const ui = await open();
		expect(ui.queryByText("No reaction")).toBeNull();
	});

	test("is nothing but the field", async () => {
		const { open } = await required();
		const ui = await open();
		expect(ui.getByPlaceholderText(":bug: or bug, eyes")).toBeDefined();
	});
});
