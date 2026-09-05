import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document: Radix needs a real DOM.
// Globals are process-wide, so unregister in afterAll (see Redirect.test.tsx).
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Queries go through `within(document.body)` rather than `screen`: in a full
// suite run an earlier file may have loaded testing-library against a previous
// happy-dom window, and `screen` stays bound to that stale body.
const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const React = await import("react");
const { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } =
	await import("@superset/ui/context-menu");
const { DestroyConfirmPane } = await import("./DestroyConfirmPane");

afterEach(() => {
	cleanup();
	document.body.style.pointerEvents = "";
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

/**
 * The sidebar's delete flow: a ContextMenu "Delete" item opens the confirm
 * pane. Selecting the item with Enter must not also confirm the pane — the
 * keystroke that picked the item is still bubbling when the pane mounts.
 */
function MenuOpensConfirmPane({ onConfirm }: { onConfirm: () => void }) {
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
			<DestroyConfirmPane
				open={open}
				onOpenChange={setOpen}
				workspaceName="ws"
				deleteBranch={false}
				onDeleteBranchChange={() => {}}
				hasChanges={false}
				hasUnpushedCommits={false}
				canConfirm
				blockingReason={null}
				onConfirm={onConfirm}
				confirmLabel="Delete"
			/>
		</>
	);
}

describe("DestroyConfirmPane Enter-to-confirm", () => {
	test("the Enter that selects the menu item does not confirm the pane", async () => {
		const onConfirm = mock(() => {});
		render(<MenuOpensConfirmPane onConfirm={onConfirm} />);
		const page = () => within(document.body);

		await act(async () => {
			fireEvent.contextMenu(page().getByText("row"), {
				clientX: 10,
				clientY: 10,
			});
		});
		const item = await page().findByRole("menuitem");
		await act(async () => {
			fireEvent.keyDown(item, { key: "Enter", code: "Enter" });
		});

		expect(page().getByRole("alertdialog")).toBeTruthy();
		expect(onConfirm).not.toHaveBeenCalled();

		// Once the opening keystroke has finished dispatching, Enter confirms
		// from anywhere: the closing menu hands focus back outside the dialog.
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		await act(async () => {
			fireEvent.keyDown(document.body, { key: "Enter", code: "Enter" });
		});
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});
});
