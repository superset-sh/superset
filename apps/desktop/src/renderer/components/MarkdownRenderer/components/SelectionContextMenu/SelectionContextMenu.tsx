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
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";

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
	const { copyToClipboard } = useCopyToClipboard();
	const [selectionText, setSelectionText] = useState("");
	const [linkHref, setLinkHref] = useState<string | null>(null);

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

		copyToClipboard(text);
	};

	const handleCopyLinkAddress = async () => {
		if (!linkHref) return;
		copyToClipboard(linkHref);
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
