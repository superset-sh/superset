"use client";

import { useLingui } from "@lingui/react/macro";
import { MessageScroller } from "@shadcn/react/message-scroller";
import { cn } from "@superset/ui/utils";
import { ArrowDownIcon } from "lucide-react";

export type ScrollToBottomButtonProps = {
	className?: string;
};

// Floating circular button that appears when the transcript is scrolled up.
// Must render inside a MessageScroller.Provider.
export function ScrollToBottomButton({ className }: ScrollToBottomButtonProps) {
	const { t } = useLingui();
	return (
		<MessageScroller.Button
			direction="end"
			behavior="smooth"
			aria-label={t({
				message: "Scroll to bottom",
			})}
			className={cn(
				"pointer-events-auto flex size-9 cursor-pointer items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur transition-[opacity,scale,color] duration-150 hover:text-foreground",
				"data-[active=false]:pointer-events-none data-[active=false]:scale-95 data-[active=false]:opacity-0",
				className,
			)}
		>
			<ArrowDownIcon className="size-4.5" />
		</MessageScroller.Button>
	);
}
