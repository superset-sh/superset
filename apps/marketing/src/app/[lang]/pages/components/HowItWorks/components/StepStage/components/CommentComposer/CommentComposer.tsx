import { Trans } from "@lingui/react/macro";
import { ArrowUp } from "lucide-react";

export function CommentComposer() {
	return (
		<div className="absolute right-4 bottom-4 left-4 rounded-[13px] border border-border bg-popover p-3 shadow-xl sm:left-auto sm:w-80">
			<p className="flex items-center gap-2 text-xs">
				<span className="flex size-5 items-center justify-center rounded-full bg-muted text-[9px]">
					MA
				</span>
				<span className="font-medium">Maya</span>
			</p>
			<p className="mt-2 text-foreground text-sm">
				<Trans>Can the headline say what happens after sign-up?</Trans>
			</p>
			<div className="mt-2 flex items-center justify-between">
				<span className="text-[10px] text-muted-foreground">⌘↵</span>
				<span className="flex size-6 items-center justify-center rounded-full bg-foreground text-background">
					<ArrowUp className="size-3.5" />
				</span>
			</div>
		</div>
	);
}
