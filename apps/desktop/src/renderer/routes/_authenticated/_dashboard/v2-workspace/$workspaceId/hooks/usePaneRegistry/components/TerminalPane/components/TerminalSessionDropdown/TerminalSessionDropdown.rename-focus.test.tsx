import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { useState } from "react";

// happy-dom is process-wide; unregister in afterAll so the shared mock
// document is restored for the other renderer suites.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, waitFor, within } = await import(
	"@testing-library/react"
);
const {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} = await import("@superset/ui/dropdown-menu");
const { useRunAfterMenuClose } = await import(
	"renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useRunAfterMenuClose"
);
const { RenameSessionDialog } = await import("./components/RenameSessionDialog");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

/**
 * Rename from the tab's session menu, which is where the focus is lost.
 *
 * The rename button sits inside a DropdownMenuItem and opens
 * RenameSessionDialog. A menu keeps focus trapped until its exit animation
 * ends, so the dialog has to be opened after the close, and the menu must not
 * pull focus back to its trigger while the dialog is taking it — otherwise
 * the dialog's input starts unfocused and the user has to click it before
 * typing (#8133).
 *
 * Mirrors the dropdown's wiring with the real dialog and the real hook, the
 * way the radix-layers suites mirror the composer. `deferToAfterClose={false}`
 * is the wiring that was there before: the dialog opens while the menu is
 * still closing.
 */
function RenameFromSessionMenu({
	deferToAfterClose,
}: {
	deferToAfterClose: boolean;
}) {
	// Opened from the start: the bug is in the close, not in the open, and a
	// real click on the tab is a pointer event Radix handles on its own.
	const [open, setOpen] = useState(true);
	const [renaming, setRenaming] = useState(false);
	const { runAfterClose, onCloseAutoFocus } = useRunAfterMenuClose();

	const startRename = () => {
		setOpen(false);
		if (deferToAfterClose) {
			runAfterClose(() => setRenaming(true));
		} else {
			setRenaming(true);
		}
	};

	return (
		<>
			{renaming && (
				<RenameSessionDialog
					name=""
					onClose={() => setRenaming(false)}
					onSubmit={() => {}}
				/>
			)}
			<DropdownMenu open={open} onOpenChange={setOpen}>
				<DropdownMenuTrigger asChild>
					<button type="button">Terminal tab</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					onCloseAutoFocus={deferToAfterClose ? onCloseAutoFocus : undefined}
				>
					<DropdownMenuItem>
						<button
							type="button"
							onClick={(event) => {
								event.preventDefault();
								event.stopPropagation();
								startRename();
							}}
						>
							Rename
						</button>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
}

async function openRename(deferToAfterClose: boolean) {
	const view = render(
		<RenameFromSessionMenu deferToAfterClose={deferToAfterClose} />,
	);
	const page = within(view.baseElement as HTMLElement);
	await act(async () => {
		fireEvent.click(page.getByRole("button", { name: "Rename" }));
	});
	return page;
}

describe("renaming a session from the tab menu", () => {
	test("the dialog's input takes focus once the menu has closed", async () => {
		const page = await openRename(true);

		const input = await page.findByRole("textbox", { name: "Session name" });
		await waitFor(() => expect(document.activeElement).toBe(input));
	});

	test("opening it while the menu still holds focus leaves the input unfocused", async () => {
		const page = await openRename(false);

		const input = await page.findByRole("textbox", { name: "Session name" });
		expect(input).not.toBeNull();
		// Let the menu finish closing and restore its focus.
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
		});
		expect(document.activeElement).not.toBe(input);
	});
});
