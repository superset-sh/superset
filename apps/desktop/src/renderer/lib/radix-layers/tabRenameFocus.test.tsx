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

function Tab({
	deferRename,
	onMenuClosed,
}: {
	deferRename: boolean;
	onMenuClosed?: () => void;
}) {
	const [isEditing, setIsEditing] = useState(false);
	const pendingRename = useRef(false);
	// Mirrors the tab's wiring: the mousedown still sees the focused element,
	// before the browser blurs it to <body>.
	const focusedBeforeMenu = useRef<HTMLElement | null>(null);
	const startEditing = () => setIsEditing(true);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					data-testid="tab"
					onMouseDownCapture={(event) => {
						if (event.button !== 2) return;
						const active = document.activeElement as HTMLElement | null;
						focusedBeforeMenu.current =
							active && active !== document.body ? active : null;
					}}
				>
					Terminal
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent
				onCloseAutoFocus={(event) => {
					if (pendingRename.current) {
						event.preventDefault();
						pendingRename.current = false;
						startEditing();
					} else {
						const target = focusedBeforeMenu.current;
						focusedBeforeMenu.current = null;
						if (
							target?.isConnected &&
							document.activeElement === document.body
						) {
							event.preventDefault();
							target.focus({ preventScroll: true });
						}
					}
					onMenuClosed?.();
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

/**
 * A promise resolved from the menu's `onCloseAutoFocus`, so a test waits for
 * the close itself instead of guessing at it with a wall-clock delay.
 */
function deferred() {
	let resolve: (() => void) | undefined;
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, resolve: () => resolve?.() };
}

async function renameFromMenu(deferRename: boolean) {
	const closed = deferred();
	const view = render(
		<Tab deferRename={deferRename} onMenuClosed={closed.resolve} />,
	);
	const page = within(view.baseElement as HTMLElement);
	await act(async () => {
		fireEvent.contextMenu(page.getByTestId("tab"));
	});
	await act(async () => {
		fireEvent.click(page.getByRole("menuitem", { name: "Rename" }));
	});
	const input = await page.findByRole("textbox", { name: "Tab title" });
	return { input, menuClosed: closed.promise };
}

describe("renaming a tab from its context menu", () => {
	test("the field holds the focus once the menu has closed", async () => {
		const { input } = await renameFromMenu(true);

		await waitFor(() => expect(document.activeElement).toBe(input));
	});

	test("starting the rename during the close leaves the field unfocused", async () => {
		const { input, menuClosed } = await renameFromMenu(false);

		// Wait for the menu to finish closing, including handing focus back,
		// instead of racing it with a fixed delay.
		await act(async () => {
			await menuClosed;
		});
		expect(document.activeElement).not.toBe(input);
	});

	test("a plain dismissal hands focus back where it was", async () => {
		const closed = deferred();
		const view = render(
			<>
				<button data-testid="outside" type="button">
					outside
				</button>
				<Tab deferRename onMenuClosed={closed.resolve} />
			</>,
		);
		const page = within(view.baseElement as HTMLElement);
		const outside = page.getByTestId("outside");
		const tab = page.getByTestId("tab");
		outside.focus();

		// The real gesture, in the order the browser runs it: the mousedown
		// still sees the focused element, and only then does Chromium blur it
		// to <body>. happy-dom's synthetic mousedown has no default action, so
		// the blur is applied by hand - it is the measured behaviour that makes
		// Radix's own restoration useless here.
		await act(async () => {
			fireEvent.mouseDown(tab, { button: 2 });
			(document.activeElement as HTMLElement | null)?.blur();
			fireEvent.contextMenu(tab);
		});
		await act(async () => {
			fireEvent.keyDown(document, { key: "Escape" });
		});
		await act(async () => {
			await closed.promise;
		});

		expect(document.activeElement).toBe(outside);
	});
});
