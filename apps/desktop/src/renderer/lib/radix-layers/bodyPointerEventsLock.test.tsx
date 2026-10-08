import { afterEach, describe, expect, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, waitFor, within } = await import(
	"@testing-library/react"
);
const React = await import("react");
const {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogTitle,
} = await import("@superset/ui/alert-dialog");
const { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } =
	await import("@superset/ui/context-menu");

afterEach(() => {
	cleanup();
	document.body.style.pointerEvents = "";
});
/**
 * The sidebar's delete flow: a modal ContextMenu item opens an AlertDialog.
 * Both are Radix DismissableLayers that lock body pointer-events while open.
 * The menu is still mounted (closing) when the dialog registers, so the two
 * layers must share one layer stack — with two copies of the layer package
 * the dialog records "none" as the value to restore and the app freezes.
 */
function MenuOpensDialog() {
	const [open, setOpen] = React.useState(false);
	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<button type="button">row</button>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem onSelect={() => setOpen(true)}>
						Delete
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
			<AlertDialog open={open} onOpenChange={setOpen}>
				<AlertDialogContent>
					<AlertDialogTitle>Delete?</AlertDialogTitle>
					<AlertDialogDescription>Confirm.</AlertDialogDescription>
					<button type="button" onClick={() => setOpen(false)}>
						Cancel
					</button>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

describe("body pointer-events lock across a context menu and an alert dialog", () => {
	test("is released after the dialog opened from the menu closes", async () => {
		render(<MenuOpensDialog />);
		const page = () => within(document.body);

		await act(async () => {
			fireEvent.contextMenu(page().getByText("row"), {
				clientX: 10,
				clientY: 10,
			});
		});
		expect(document.body.style.pointerEvents).toBe("none");

		await act(async () => {
			fireEvent.click(await page().findByText("Delete"));
		});
		expect(page().getByRole("alertdialog")).toBeTruthy();
		// One shared layer stack keeps the lock held while the dialog is open.
		expect(document.body.style.pointerEvents).toBe("none");

		await act(async () => {
			fireEvent.click(page().getByText("Cancel"));
		});
		await waitFor(() => {
			expect(document.querySelector('[role="alertdialog"]')).toBeNull();
			expect(document.querySelector('[role="menu"]')).toBeNull();
		});
		expect(document.body.style.pointerEvents).toBe("");
	});
});
