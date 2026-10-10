import { Trans } from "@lingui/react/macro";
import { ArrowUp, Bot, GitBranch } from "lucide-react";

export function ReviewCard() {
	return (
		<div className="absolute right-4 bottom-4 left-4 overflow-hidden rounded-md border border-border bg-popover shadow-xl sm:right-8 sm:bottom-8 sm:left-auto sm:w-80">
			<div className="flex items-center gap-2 border-border border-b px-3 py-2 text-muted-foreground text-xs">
				<GitBranch className="size-3.5" />
				<span className="truncate font-mono">dependency-sweep</span>
				<span className="ml-auto font-mono">
					<span className="text-emerald-500">+38</span>{" "}
					<span className="text-red-500">−21</span>
				</span>
			</div>
			<div className="flex gap-2 px-3 py-3">
				<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
					<Bot className="size-3" />
				</span>
				<p className="min-w-0 text-sm">
					<Trans>
						I updated 9 packages and opened a pull request. React needs a major
						upgrade, so I left it for you.
					</Trans>
				</p>
			</div>
			<div className="flex items-center gap-2 border-border border-t px-3 py-2 text-sm">
				<span className="flex-1 truncate">
					<Trans>Do the React upgrade too.</Trans>
				</span>
				<span className="flex size-6 items-center justify-center rounded-full bg-foreground text-background">
					<ArrowUp className="size-3.5" />
				</span>
			</div>
		</div>
	);
}
