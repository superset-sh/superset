import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiOutlineDocument, HiOutlineFolder } from "react-icons/hi2";
import { useAutocompleteStore } from "../stores/autocomplete-store";

interface CompletionDropdownProps {
	xterm: XTerm | null;
	onSelect: (insertText: string) => void;
	onClose: () => void;
}

interface Position {
	x: number;
	y: number;
}

/**
 * CompletionDropdown displays file/directory completions below the cursor.
 * Triggered by Tab key when in a path context.
 */
export function CompletionDropdown({
	xterm,
	onSelect,
	onClose,
}: CompletionDropdownProps) {
	const isOpen = useAutocompleteStore((s) => s.isCompletionDropdownOpen);
	const completions = useAutocompleteStore((s) => s.completions);
	const selectedIndex = useAutocompleteStore((s) => s.selectedCompletionIndex);
	const selectNext = useAutocompleteStore((s) => s.selectNextCompletion);
	const selectPrev = useAutocompleteStore((s) => s.selectPrevCompletion);

	const [position, setPosition] = useState<Position | null>(null);
	const listRef = useRef<HTMLDivElement>(null);

	// Calculate dropdown position based on cursor
	useEffect(() => {
		if (!xterm || !isOpen) {
			setPosition(null);
			return;
		}

		const updatePosition = () => {
			try {
				const container = xterm.element;
				if (!container) return;

				// Get cell dimensions - access internal xterm properties
				const core = (
					xterm as unknown as {
						_core?: {
							_renderService?: {
								dimensions?: {
									css?: { cell?: { width?: number; height?: number } };
								};
							};
						};
					}
				)._core;
				const cellWidth =
					core?._renderService?.dimensions?.css?.cell?.width ?? 9;
				const cellHeight =
					core?._renderService?.dimensions?.css?.cell?.height ?? 17;

				// Get cursor position
				const cursorX = xterm.buffer.active.cursorX;
				const cursorY = xterm.buffer.active.cursorY;

				// Position dropdown below cursor
				const x = Math.max(0, cursorX * cellWidth - 100); // Center-ish
				const y = (cursorY + 1) * cellHeight + 4;

				setPosition({ x, y });
			} catch {
				setPosition(null);
			}
		};

		updatePosition();
	}, [xterm, isOpen]);

	// Scroll selected item into view
	useEffect(() => {
		if (listRef.current) {
			const selectedElement = listRef.current.children[selectedIndex] as
				| HTMLElement
				| undefined;
			selectedElement?.scrollIntoView({ block: "nearest" });
		}
	}, [selectedIndex]);

	// Handle keyboard navigation
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (!isOpen) return;

			switch (e.key) {
				case "ArrowDown":
				case "Tab":
					if (!e.shiftKey) {
						e.preventDefault();
						selectNext();
					} else {
						e.preventDefault();
						selectPrev();
					}
					break;
				case "ArrowUp":
					e.preventDefault();
					selectPrev();
					break;
				case "Enter":
					e.preventDefault();
					if (completions[selectedIndex]) {
						onSelect(completions[selectedIndex].insertText);
					}
					break;
				case "Escape":
					e.preventDefault();
					onClose();
					break;
			}
		},
		[
			isOpen,
			completions,
			selectedIndex,
			selectNext,
			selectPrev,
			onSelect,
			onClose,
		],
	);

	// Add keyboard listener
	useEffect(() => {
		if (!isOpen) return;

		window.addEventListener("keydown", handleKeyDown, true);
		return () => {
			window.removeEventListener("keydown", handleKeyDown, true);
		};
	}, [isOpen, handleKeyDown]);

	const handleItemClick = useCallback(
		(insertText: string) => {
			onSelect(insertText);
		},
		[onSelect],
	);

	if (!isOpen || !position || completions.length === 0) {
		return null;
	}

	return (
		<div
			className="absolute z-20 min-w-48 max-w-80 rounded-md border border-border bg-popover shadow-lg"
			style={{
				left: position.x,
				top: position.y,
			}}
		>
			<div ref={listRef} className="max-h-48 overflow-y-auto p-1">
				{completions.map((item, index) => (
					<button
						key={item.name}
						type="button"
						onClick={() => handleItemClick(item.insertText)}
						className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
							index === selectedIndex
								? "bg-primary/20 text-foreground"
								: "text-foreground/80 hover:bg-muted"
						}`}
					>
						{item.isDirectory ? (
							<HiOutlineFolder className="size-4 shrink-0 text-blue-400" />
						) : (
							<HiOutlineDocument className="size-4 shrink-0 text-muted-foreground" />
						)}
						<span className="truncate font-mono">{item.name}</span>
						{item.isDirectory && (
							<span className="ml-auto text-xs text-muted-foreground">/</span>
						)}
					</button>
				))}
			</div>
			<div className="border-t border-border px-2 py-1 text-xs text-muted-foreground">
				<kbd className="rounded bg-muted px-1">Tab</kbd> next
				<span className="mx-1">·</span>
				<kbd className="rounded bg-muted px-1">Enter</kbd> select
			</div>
		</div>
	);
}
