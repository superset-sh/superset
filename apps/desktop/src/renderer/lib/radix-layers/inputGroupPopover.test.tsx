import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, waitFor, within } = await import(
	"@testing-library/react"
);
const { InputGroup, InputGroupAddon } = await import(
	"@superset/ui/input-group"
);
const { Popover, PopoverContent, PopoverTrigger } = await import(
	"@superset/ui/popover"
);

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

// Mirrors the workspace composer: Radix content is portaled out of the DOM
// footer but its React click events still bubble through InputGroupAddon.
function ComposerWithIssuePicker() {
	return (
		<InputGroup>
			<div contentEditable data-testid="composer" />
			<InputGroupAddon>
				<span>Footer padding</span>
				<Popover>
					<PopoverTrigger asChild>
						<button type="button">Link issue</button>
					</PopoverTrigger>
					<PopoverContent>
						<input aria-label="Search issues" />
						<label htmlFor="closed-issues">Show closed</label>
						<input id="closed-issues" type="checkbox" />
					</PopoverContent>
				</Popover>
			</InputGroupAddon>
		</InputGroup>
	);
}

describe("input group popup interactions", () => {
	test("clicking and typing in a portaled search keeps the popup focused and open", async () => {
		render(<ComposerWithIssuePicker />);
		const page = within(document.body);
		await act(async () => {
			fireEvent.click(page.getByRole("button", { name: "Link issue" }));
		});
		const search = page.getByRole("textbox", { name: "Search issues" });
		await waitFor(() => expect(document.activeElement).toBe(search));

		await act(async () => {
			fireEvent.click(search);
			fireEvent.change(search, { target: { value: "popup" } });
		});

		expect(page.queryByRole("dialog")).not.toBeNull();
		expect(document.activeElement).toBe(search);
		expect((search as HTMLInputElement).value).toBe("popup");

		await act(async () => {
			fireEvent.click(page.getByText("Show closed"));
		});
		expect(page.queryByRole("dialog")).not.toBeNull();
		expect((page.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
		expect(document.activeElement).not.toBe(page.getByTestId("composer"));
	});

	test("ordinary addon clicks still focus the composer and buttons keep their action", async () => {
		render(<ComposerWithIssuePicker />);
		const page = within(document.body);
		await act(async () => {
			fireEvent.click(page.getByText("Footer padding"));
		});
		expect(document.activeElement).toBe(page.getByTestId("composer"));

		await act(async () => {
			fireEvent.click(page.getByRole("button", { name: "Link issue" }));
		});
		expect(page.queryByRole("dialog")).not.toBeNull();
		await waitFor(() =>
			expect(document.activeElement).toBe(
				page.getByRole("textbox", { name: "Search issues" }),
			),
		);
	});
});
