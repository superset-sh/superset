import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

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
const { useEffect, useRef, useState } = await import("react");
const {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} = await import("@superset/ui/context-menu");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

/**
 * Renaming a tab from its context menu, which is where the field opens
 * unfocused (#8133).
 *
 * The menu keeps focus trapped until its exit animation ends, so a rename
 * started while it closes loses the focus the input takes on mount — the tab
 * then selects its pane and typing goes to the terminal. Deferring the rename
 * to the menu's `onCloseAutoFocus` is what makes it stick, the same shape as
 * the sidebar's `useRunAfterMenuClose`.
 *
 * Mirrors the tab's wiring (packages/panes .../TabBar/TabItem) with the real
 * Radix menu, the way the neighbouring suites mirror the composer. The input
 * mirrors `TabRenameInput`, which focuses and selects itself on mount.
 */
function RenameInput() {
	const inputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);
	return <input ref={inputRef} aria-label="Tab title" defaultValue="Terminal" />;
}

function Tab({ deferRename }: { deferRename: boolean }) {
	const [isEditing, setIsEditing] = useState(false);
	const pendingRename = useRef(false);
	const startEditing = () => setIsEditing(true);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div data-testid="tab">Terminal</div>
			</ContextMenuTrigger>
			<ContextMenuContent
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					if (pendingRename.current) {
						pendingRename.current = false;
						startEditing();
					}
				}}
			>
				<ContextMenuItem
					onSelect={() => {
						if (deferRename) {
							pendingRename.current = true;
						} else {
							startEditing();
						}
					}}
				>
					Rename
				</ContextMenuItem>
			</ContextMenuContent>
			{isEditing && <RenameInput />}
		</ContextMenu>
	);
}

async function renameFromMenu(deferRename: boolean) {
	const view = render(<Tab deferRename={deferRename} />);
	const page = within(view.baseElement as HTMLElement);
	await act(async () => {
		fireEvent.contextMenu(page.getByTestId("tab"));
	});
	await act(async () => {
		fireEvent.click(page.getByRole("menuitem", { name: "Rename" }));
	});
	const input = await page.findByRole("textbox", { name: "Tab title" });
	return input;
}

describe("renaming a tab from its context menu", () => {
	test("the field holds the focus once the menu has closed", async () => {
		const input = await renameFromMenu(true);

		await waitFor(() => expect(document.activeElement).toBe(input));
	});

	test("starting the rename during the close leaves the field unfocused", async () => {
		const input = await renameFromMenu(false);

		// Let the menu finish closing, including handing focus back.
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 60));
		});
		expect(document.activeElement).not.toBe(input);
	});
});
