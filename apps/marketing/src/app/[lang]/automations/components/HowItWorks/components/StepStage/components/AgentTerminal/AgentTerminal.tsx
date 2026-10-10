import { Trans } from "@lingui/react/macro";

export function AgentTerminal() {
	return (
		<div className="absolute right-4 bottom-4 left-4 rounded-lg border border-border bg-background font-mono text-[11px] shadow-xl sm:right-auto sm:bottom-8 sm:left-8 sm:w-96">
			<div className="flex h-7 items-center gap-2 border-border border-b px-3 text-muted-foreground">
				claude
				<span className="ml-auto truncate">dependency-sweep</span>
			</div>
			<div className="space-y-1 p-3 leading-relaxed">
				<p className="text-foreground">
					&gt;{" "}
					<Trans>
						Check each package for a newer version. Update the safe ones and
						open a pull request.
					</Trans>
				</p>
				<p className="text-muted-foreground">
					<span className="text-emerald-500">●</span> Bash(bun outdated)
				</p>
				<p className="pl-3 text-emerald-500">
					└ <Trans>12 packages have a newer version</Trans>
				</p>
			</div>
		</div>
	);
}
