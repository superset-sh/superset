/**
 * Jump-to-bottom pill shown at the bottom-right of the Timeline when
 * the user has scrolled up. Clicking resumes auto-scroll and snaps to
 * the latest message.
 */

import { ArrowDown } from "lucide-react";

export interface JumpToBottomButtonProps {
	visible: boolean;
	onJump: () => void;
}

export function JumpToBottomButton({
	visible,
	onJump,
}: JumpToBottomButtonProps) {
	return (
		<button
			type="button"
			onClick={onJump}
			aria-label="Jump to latest"
			data-visible={visible ? "true" : "false"}
			className="border-border bg-background/80 text-muted-foreground hover:bg-background hover:text-foreground pointer-events-auto absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border px-2.5 py-1 text-xs shadow-md backdrop-blur transition-all data-[visible=false]:pointer-events-none data-[visible=false]:translate-y-2 data-[visible=false]:opacity-0 data-[visible=true]:translate-y-0 data-[visible=true]:opacity-100"
			tabIndex={visible ? 0 : -1}
		>
			<ArrowDown className="size-3" />
			Jump to latest
		</button>
	);
}
