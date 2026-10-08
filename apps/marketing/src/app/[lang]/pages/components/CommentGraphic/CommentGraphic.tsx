import { Trans } from "@lingui/react/macro";
import { ArrowUp } from "lucide-react";
import { StepFrame } from "../StepFrame";

export function CommentGraphic() {
	return (
		<StepFrame>
			<div className="relative w-full max-w-sm">
				<div className="rounded-lg border border-border bg-background px-5 pt-5 pb-16">
					<p className="font-mono text-[10px] text-brand uppercase tracking-widest">
						<Trans>Design review</Trans>
					</p>
					<div className="relative mt-2 inline-block">
						<p className="rounded-sm font-medium text-foreground text-xl tracking-tight outline-1 outline-blue-500 outline-offset-4 outline-dashed">
							<Trans>Sign up in one step</Trans>
						</p>
						<span className="absolute -top-4 -right-6 flex size-6 items-center justify-center rounded-full rounded-bl-sm bg-blue-600 font-medium text-[10px] text-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] ring-1 ring-white">
							1
						</span>
					</div>
					<div className="mt-4 space-y-1.5">
						<div className="h-1.5 w-full rounded-full bg-muted" />
						<div className="h-1.5 w-4/5 rounded-full bg-muted" />
					</div>
				</div>
				<div className="absolute right-3 -bottom-6 left-10 rounded-[13px] border border-border bg-popover p-3 shadow-xl">
					<p className="text-foreground text-xs">
						<Trans>Can the headline say what happens after sign-up?</Trans>
					</p>
					<div className="mt-2 flex items-center justify-between">
						<span className="text-[10px] text-muted-foreground">⌘↵</span>
						<span className="flex size-6 items-center justify-center rounded-full bg-foreground text-background">
							<ArrowUp className="size-3.5" />
						</span>
					</div>
				</div>
			</div>
		</StepFrame>
	);
}
