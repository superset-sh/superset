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
const { TokenField, SEPARATORS_WITH_SPACE } = await import("./TokenField");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

/**
 * Renders the field over a live `values` array, the way its parents do — the
 * chip owns the scope and feeds it back, so a test that never re-renders would
 * pass while a second commit silently dropped the first.
 *
 * Queries go through the render's baseElement, not the global `screen`, which
 * binds document.body at import time and goes stale when another suite
 * unregisters happy-dom.
 */
async function setup(
	initial: string[] = [],
	props: Partial<Parameters<typeof TokenField>[0]> = {},
) {
	let values = initial;
	const onChange = mock((next: string[]) => {
		values = next;
		rerender();
	});
	let view!: ReturnType<typeof render>;
	const element = () => (
		<TokenField
			values={values}
			onChange={onChange}
			placeholder="GitHub username..."
			{...props}
		/>
	);
	const rerender = () => view?.rerender(element());
	await act(async () => {
		view = render(element());
	});
	const ui = within(view.baseElement as HTMLElement);
	// Not by placeholder: it is deliberately blanked once the field holds a
	// chip, so a placeholder query only finds an empty field.
	const input = ui.getByRole("textbox");
	const typeAndCommit = async (text: string) => {
		await act(async () => {
			fireEvent.change(input, { target: { value: text } });
		});
	};
	return {
		get values() {
			return values;
		},
		ui,
		input,
		typeAndCommit,
		onChange,
	};
}

describe("TokenField committing", () => {
	test("a comma commits what precedes it", async () => {
		const field = await setup();
		await field.typeAndCommit("alice,");
		expect(field.values).toEqual(["alice"]);
	});

	test("Enter commits, since there is no result list for it to pick from", async () => {
		const field = await setup();
		await act(async () => {
			fireEvent.change(field.input, { target: { value: "alice" } });
			fireEvent.keyDown(field.input, { key: "Enter" });
		});
		expect(field.values).toEqual(["alice"]);
	});

	// Leaving the field is the case that used to lose typed text outright.
	test("leaving the field commits rather than discarding", async () => {
		const field = await setup();
		await act(async () => {
			fireEvent.change(field.input, { target: { value: "alice" } });
			fireEvent.blur(field.input);
		});
		expect(field.values).toEqual(["alice"]);
	});

	test("one paste can carry a whole list", async () => {
		const field = await setup();
		await act(async () => {
			fireEvent.paste(field.input, {
				clipboardData: { getData: () => "alice, bob\ncarol" },
			});
		});
		expect(field.values).toEqual(["alice", "bob", "carol"]);
	});

	test("strips a leading @ for logins, which is how people copy a handle", async () => {
		const field = await setup([], { stripLeadingAt: true });
		await field.typeAndCommit("@alice,");
		expect(field.values).toEqual(["alice"]);
	});

	// Off by default: the same field takes branches and labels, and a branch
	// may legitimately be called "@next" — stripping there stores a ref that
	// does not exist.
	test("keeps a leading @ where it can be part of the value", async () => {
		const field = await setup();
		await field.typeAndCommit("@next,");
		expect(field.values).toEqual(["@next"]);
	});

	test("ignores a repeat rather than showing it twice", async () => {
		const field = await setup(["alice"]);
		await field.typeAndCommit("alice,");
		expect(field.values).toEqual(["alice"]);
	});

	test("commits each value as it is typed, keeping the order", async () => {
		const field = await setup();
		await field.typeAndCommit("alice,");
		await field.typeAndCommit("bob,");
		expect(field.values).toEqual(["alice", "bob"]);
	});
});

describe("TokenField separators", () => {
	// A GitHub login cannot contain a space; a label like "good first issue"
	// very much can, so the space is opt-in per field.
	test("a space commits when the value cannot contain one", async () => {
		const field = await setup([], { separators: SEPARATORS_WITH_SPACE });
		await field.typeAndCommit("alice ");
		expect(field.values).toEqual(["alice"]);
	});

	test("a space is just text by default", async () => {
		const field = await setup();
		await field.typeAndCommit("good first issue");
		expect(field.values).toEqual([]);
	});

	test("a label keeps its spaces when committed", async () => {
		const field = await setup();
		await field.typeAndCommit("good first issue,");
		expect(field.values).toEqual(["good first issue"]);
	});
});

describe("TokenField removing", () => {
	test("backspace on an empty field deletes the last chip", async () => {
		const field = await setup(["alice", "bob"]);
		await act(async () => {
			fireEvent.keyDown(field.input, { key: "Backspace" });
		});
		expect(field.values).toEqual(["alice"]);
	});

	test("backspace with text in the field leaves the chips alone", async () => {
		const field = await setup(["alice"]);
		await act(async () => {
			fireEvent.change(field.input, { target: { value: "bo" } });
			fireEvent.keyDown(field.input, { key: "Backspace" });
		});
		expect(field.values).toEqual(["alice"]);
	});

	test("the chip's own button removes just that one", async () => {
		const field = await setup(["alice", "bob"]);
		await act(async () => {
			field.ui.getByLabelText("Remove alice").click();
		});
		expect(field.values).toEqual(["bob"]);
	});
});
