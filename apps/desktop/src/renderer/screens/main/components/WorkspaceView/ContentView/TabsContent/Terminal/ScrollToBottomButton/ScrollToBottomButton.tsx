import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useState } from "react";
import { HiArrowDown } from "react-icons/hi2";
import { useHotkeyText } from "renderer/stores/hotkeys";
import { scrollToBottom } from "../utils";

interface ScrollToBottomButtonProps {
	terminal: Terminal | null;
}

export function ScrollToBottomButton({ terminal }: ScrollToBottomButtonProps) {
	const [isVisible, setIsVisible] = useState(false);
	const shortcutText = useHotkeyText("SCROLL_TO_BOTTOM");
	const showShortcut = shortcutText !== "Unassigned";

	const checkScrollPosition = useCallback(() => {
		if (!terminal) return;
		const buffer = terminal.buffer.active;
		const isAtBottom = buffer.viewportY >= buffer.baseY;
		setIsVisible(!isAtBottom);
	}, [terminal]);

	useEffect(() => {
		if (!terminal) return;

		checkScrollPosition();

		const writeDisposable = terminal.onWriteParsed(checkScrollPosition);
		const scrollDisposable = terminal.onScroll(checkScrollPosition);

		return () => {
			writeDisposable.dispose();
			scrollDisposable.dispose();
		};
	}, [terminal, checkScrollPosition]);

	const handleClick = () => {
		if (terminal) {
			scrollToBottom(terminal);
		}
	};

	return (
		<div
			className={cn(
				"absolute bottom-4 left-1/2 z-10 -translate-x-1/2 transition-all duration-200",
				isVisible
					? "translate-y-0 opacity-100"
					: "pointer-events-none translate-y-2 opacity-0",
			)}
		>
			<Tooltip delayDuration={500}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleClick}
						className="flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
