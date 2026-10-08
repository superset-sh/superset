import { Trans } from "@lingui/react/macro";
import { StepFrame } from "../StepFrame";

export function CreateGraphic() {
	return (
		<StepFrame>
			<div className="w-full max-w-sm overflow-hidden rounded-lg border border-border bg-background font-mono text-[11px] shadow-lg">
				<div className="flex h-8 items-center gap-4 border-border border-b px-3 text-muted-foreground">
					<span className="border-foreground border-b pb-1.5 text-foreground">
						claude
					</span>
					<span className="pb-1.5">dev server</span>
				</div>
				<div className="space-y-1.5 p-3 leading-relaxed">
					<p className="text-foreground">
						&gt; <Trans>turn the onboarding findings into a page</Trans>
					</p>
					<p className="text-muted-foreground">
						<span className="text-emerald-500">●</span> Bash(superset pages
						publish onboarding.html)
					</p>
					<p className="pl-3 text-emerald-500">
						└ Published superset.sh/page/onboarding
					</p>
					<p className="pl-5 text-muted-foreground">
						version 1 · watching for comments
					</p>
				</div>
			</div>
		</StepFrame>
	);
}
