import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useState } from "react";
import { HiArrowDown } from "react-icons/hi2";
import { useHotkeyText } from "renderer/stores/hotkeys";
import { smoothScrollToBottom } from "../utils";

interface ScrollToBottomButtonProps {
	terminal: Terminal | null;
	isHovered: boolean;
}

export function ScrollToBottomButton({
	terminal,
	isHovered,
}: ScrollToBottomButtonProps) {
	const [isNotAtBottom, setIsNotAtBottom] = useState(false);
	const shortcutText = useHotkeyText("SCROLL_TO_BOTTOM");
	const showShortcut = shortcutText !== "Unassigned";

	const checkScrollPosition = useCallback(() => {
		if (!terminal) return;
		const buffer = terminal.buffer.active;
		const isAtBottom = buffer.viewportY >= buffer.baseY;
		setIsNotAtBottom(!isAtBottom);
	}, [terminal]);

	useEffect(() => {
		if (!terminal) return;

		checkScrollPosition();

		const writeDisposable = terminal.onWriteParsed(checkScrollPosition);
		const viewport = terminal.element?.querySelector(".xterm-viewport");

		if (viewport) {
			viewport.addEventListener("scroll", checkScrollPosition);
		}

		return () => {
			writeDisposable.dispose();
			viewport?.removeEventListener("scroll", checkScrollPosition);
		};
	}, [terminal, checkScrollPosition]);

	const handleClick = () => {
		if (terminal) {
			smoothScrollToBottom(terminal);
		}
	};

	const isVisible = isNotAtBottom && isHovered;

	return (
		<div
			className={cn(
				"absolute bottom-4 right-4 z-10 transition-all duration-200",
				isVisible
					? "translate-y-0 opacity-100"
					: "pointer-events-none translate-y-2 opacity-0",
			)}
			aria-hidden={!isVisible}
		>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleClick}
						tabIndex={isVisible ? 0 : -1}
						className="flex size-8 items-center justify-center rounded-full border border-border/50 bg-background/80 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-muted/90 hover:text-foreground"
					>
						<HiArrowDown className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="left">
					Scroll to bottom{showShortcut && ` (${shortcutText})`}
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
