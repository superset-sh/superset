import { Trans } from "@lingui/react/macro";
import { Bot, Check } from "lucide-react";

export function CommentThread() {
	return (
		<div className="absolute right-4 bottom-4 left-4 overflow-hidden rounded-md border border-border bg-popover shadow-xl sm:left-auto sm:w-80">
			<div className="flex gap-2 px-3 pt-3 pb-1.5">
				<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px]">
					MA
				</span>
				<div className="min-w-0 text-sm">
					<p className="flex items-baseline gap-2">
						<span className="font-medium">Maya</span>
						<span className="text-muted-foreground text-xs">
							<Trans>4 min ago</Trans>
						</span>
					</p>
					<p>
						<Trans>Can the headline say what happens after sign-up?</Trans>
					</p>
				</div>
			</div>
			<div className="flex gap-2 px-3 pt-1.5 pb-3">
				<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
					<Bot className="size-3" />
				</span>
				<div className="min-w-0 text-sm">
					<p className="flex items-baseline gap-2">
						<span className="font-medium">
							<Trans>Agent</Trans>
						</span>
						<span className="text-muted-foreground text-xs">
							<Trans>just now</Trans>
						</span>
					</p>
					<p>
						<Trans>Rewrote it and published version 2.</Trans>
					</p>
				</div>
			</div>
			<div className="flex items-center gap-2 border-border border-t px-3 py-2 text-muted-foreground text-xs">
				<Check className="size-3.5 text-emerald-500" />
				<Trans>Resolved</Trans>
				<span className="ml-auto font-mono">v1 → v2</span>
			</div>
		</div>
	);
}
