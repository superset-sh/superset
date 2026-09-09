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

		// Focus stays in the dialog after the context menu closes.
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		await act(async () => {
			expect(document.activeElement).toBe(
				within(page().getByRole("alertdialog")).getByRole("button", {
					name: "Delete",
				}),
			);
			const action = document.activeElement ?? document.body;
			expect(fireEvent.keyDown(action, { key: "Enter", code: "Enter" })).toBe(
				true,
			);
			// happy-dom does not synthesize native button activation from keys.
			// CDP coverage exercises the browser's real Enter-to-click behavior.
			fireEvent.click(action);
		});
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});
});

test("opening from an agent input focuses the native action without intercepting typing", async () => {
	const onConfirm = mock(() => {});
	const onOpenChange = mock(() => {});
	const agentKeyDown = mock(() => {});
	const input = document.createElement("textarea");
	document.body.append(input);
	input.focus();
	window.addEventListener("keydown", agentKeyDown);
	const props = {
		open: false,
		onOpenChange,
		workspaceName: "ws",
		deleteBranch: false,
		onDeleteBranchChange: () => {},
		hasChanges: false,
		hasUnpushedCommits: false,
		canConfirm: true,
		blockingReason: null,
		onConfirm,
		confirmLabel: "Delete",
	};
	try {
		const view = render(<DestroyConfirmPane {...props} />);
		view.rerender(<DestroyConfirmPane {...props} open />);
		const dialog = within(document.body).getByRole("alertdialog");
		const confirm = within(dialog).getByRole("button", { name: "Delete" });
		expect(document.activeElement).toBe(confirm);
		fireEvent.keyDown(document.activeElement ?? document.body, { key: "a" });
		expect(agentKeyDown).toHaveBeenCalledTimes(1);
		input.focus();
		expect(document.activeElement).toBe(confirm);
		expect(fireEvent.keyDown(confirm, { key: "Enter", repeat: true })).toBe(
			false,
		);
		expect(
			fireEvent.keyDown(confirm, { key: "Enter", isComposing: true }),
		).toBe(false);
		expect(onConfirm).not.toHaveBeenCalled();
		expect(fireEvent.keyDown(confirm, { key: "Enter" })).toBe(true);
		fireEvent.click(confirm);
		expect(onConfirm).toHaveBeenCalledTimes(1);
		fireEvent.keyDown(within(dialog).getByRole("button", { name: "Cancel" }), {
			key: "Enter",
		});
		expect(onConfirm).toHaveBeenCalledTimes(1);
		view.rerender(<DestroyConfirmPane {...props} open canConfirm={false} />);
		fireEvent.keyDown(dialog, { key: "Enter" });
		expect(onConfirm).toHaveBeenCalledTimes(1);
		view.rerender(<DestroyConfirmPane {...props} />);
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		input.focus();
		view.rerender(<DestroyConfirmPane {...props} open canConfirm={false} />);
		expect(document.activeElement).toBe(
			within(document.body).getByRole("button", { name: "Cancel" }),
		);
	} finally {
		window.removeEventListener("keydown", agentKeyDown);
		input.remove();
	}
});
