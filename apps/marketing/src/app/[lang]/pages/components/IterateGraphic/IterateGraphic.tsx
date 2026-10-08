import { Trans } from "@lingui/react/macro";
import { Bot, Check } from "lucide-react";
import { StepFrame } from "../StepFrame";

export function IterateGraphic() {
	return (
		<StepFrame>
			<div className="w-full max-w-sm overflow-hidden rounded-md border border-border bg-popover shadow-lg">
				<div className="flex gap-2 px-3 pt-3 pb-1.5">
					<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px]">
						MA
					</span>
					<div className="min-w-0">
						<p className="flex items-baseline gap-2">
							<span className="font-medium text-sm">Maya</span>
							<span className="text-muted-foreground text-xs">
								<Trans>4 min ago</Trans>
							</span>
						</p>
						<p className="text-sm">
							<Trans>Can the headline say what happens after sign-up?</Trans>
						</p>
					</div>
				</div>
				<div className="flex gap-2 px-3 pt-1.5 pb-3">
					<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
						<Bot className="size-3" />
					</span>
					<div className="min-w-0">
						<p className="flex items-baseline gap-2">
							<span className="font-medium text-sm">
								<Trans>Agent</Trans>
							</span>
							<span className="text-muted-foreground text-xs">
								<Trans>just now</Trans>
							</span>
						</p>
						<p className="text-sm">
							<Trans>
								Rewrote it and added the next steps below. Published as version
								3.
							</Trans>
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2 border-border border-t px-3 py-2 text-muted-foreground text-xs">
					<Check className="size-3.5 text-emerald-500" />
					<Trans>Resolved</Trans>
					<span className="ml-auto font-mono">v2 → v3</span>
				</div>
			</div>
		</StepFrame>
	);
}
