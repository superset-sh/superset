import { Trans } from "@lingui/react/macro";
import {
	ArrowUp,
	ChevronDown,
	SquareDashedMousePointer,
	X,
} from "lucide-react";

export function DesignPrompt() {
	return (
		<div className="absolute right-4 bottom-4 left-4 rounded-xl border border-border/80 bg-popover text-[12px] shadow-xl sm:left-auto sm:w-80">
			<p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-3 pt-2.5 pb-1">
				<span className="inline-flex items-center gap-1 font-medium text-[#0d99ff]">
					<SquareDashedMousePointer className="size-3.5" />
					CTAButton
				</span>
				<span className="text-foreground">
					<Trans>make this the main action on the page</Trans>
				</span>
			</p>
			<div className="flex items-center gap-1.5 px-2.5 pt-1 pb-2">
				<span className="inline-flex h-6 items-center gap-0.5 rounded-full border border-border/60 px-1.5 text-muted-foreground">
					<SquareDashedMousePointer className="size-3" />
					<X className="size-3" />
				</span>
				<span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border/60 px-2 text-foreground">
					<span className="text-[#d97757]">✳</span>
					claude
					<span className="text-muted-foreground">· 5920f5</span>
					<ChevronDown className="size-3 text-muted-foreground" />
				</span>
				<span className="ml-auto grid size-6 place-items-center rounded-full bg-foreground text-background">
					<ArrowUp className="size-3.5" strokeWidth={2.5} />
				</span>
			</div>
		</div>
	);
}
