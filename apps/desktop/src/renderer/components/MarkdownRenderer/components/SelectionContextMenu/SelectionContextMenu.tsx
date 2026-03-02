import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import type {
	MouseEvent as ReactMouseEvent,
	ReactNode,
	RefObject,
} from "react";
import { useState } from "react";
import { LuCopy } from "react-icons/lu";

function getModifierKeyLabel() {
	const isMac = navigator.platform.toLowerCase().includes("mac");
	return isMac ? "⌘" : "Ctrl+";
}

interface SelectionContextMenuProps<T extends HTMLElement> {
	children: ReactNode;
	selectAllContainerRef: RefObject<T | null>;
}

export function SelectionContextMenu<T extends HTMLElement>({
	children,
	selectAllContainerRef,
}: SelectionContextMenuProps<T>) {
	const [selectionText, setSelectionText] = useState("");
	const [linkHref, setLinkHref] = useState<string | null>(null);

	const copyTextToClipboard = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			return;
		} catch {
			// Fall through to legacy copy method.
		}

		// Legacy fallback: `execCommand("copy")` copies from the currently-selected input/textarea.
		// Snapshot the current selection ranges so we can restore the user's selection after copying.
		const selection = document.getSelection();
		const savedRanges =
			selection?.rangeCount && selection.rangeCount > 0
				? Array.from({ length: selection.rangeCount }, (_, index) =>
						selection.getRangeAt(index).cloneRange(),
					)
				: [];

		const textarea = document.createElement("textarea");
		textarea.value = text;
		textarea.setAttribute("readonly", "");
		textarea.style.position = "fixed";
		textarea.style.top = "-9999px";
		textarea.style.left = "-9999px";
		textarea.style.opacity = "0";
		document.body.appendChild(textarea);

		textarea.select();
		textarea.setSelectionRange(0, textarea.value.length);

		try {
			document.execCommand("copy");
		} catch {
			// Ignore; clipboard access may be restricted.
		} finally {
			textarea.remove();
		}

		if (selection) {
			selection.removeAllRanges();
			for (const range of savedRanges) {
				selection.addRange(range);
			}
		}
	};

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			setLinkHref(null);
			return;
		}

		const selection = window.getSelection();
		setSelectionText(selection?.toString() ?? "");
	};

	const handleContextMenuCapture = (event: ReactMouseEvent) => {
		const selection = window.getSelection();
		setSelectionText(selection?.toString() ?? "");

		const target = event.target;
		const anchor = target instanceof Element ? target.closest("a") : null;
		setLinkHref(anchor instanceof HTMLAnchorElement ? anchor.href : null);
	};

	const handleCopy = async () => {
		const selection = window.getSelection();
		// `selection.toString()` can become "" when interacting with the context menu, even though we captured
		// the selected text on open; use `||` so Copy still works in that case.
		const text = selection?.toString() || selectionText;
		if (!text) return;

		await copyTextToClipboard(text);
	};

	const handleCopyLinkAddress = async () => {
		if (!linkHref) return;
		await copyTextToClipboard(linkHref);
	};

	const handleSelectAll = () => {
		const container = selectAllContainerRef.current;
		const selection = window.getSelection();
		if (!container || !selection) return;

		const range = document.createRange();
		range.selectNodeContents(container);
		selection.removeAllRanges();
		selection.addRange(range);
		setSelectionText(selection.toString());
	};

	const canCopy = selectionText.trim().length > 0;
	const modifierKeyLabel = getModifierKeyLabel();

	return (
		<ContextMenu onOpenChange={handleOpenChange}>
			<ContextMenuTrigger
				asChild
				onContextMenuCapture={handleContextMenuCapture}
			>
				{children}
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem disabled={!canCopy} onSelect={handleCopy}>
					<LuCopy className="size-4" />
					Copy
					<ContextMenuShortcut>{`${modifierKeyLabel}C`}</ContextMenuShortcut>
				</ContextMenuItem>
				{linkHref && (
					<ContextMenuItem onSelect={handleCopyLinkAddress}>
						Copy Link Address
					</ContextMenuItem>
				)}
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={handleSelectAll}>
					Select All
					<ContextMenuShortcut>{`${modifierKeyLabel}A`}</ContextMenuShortcut>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
