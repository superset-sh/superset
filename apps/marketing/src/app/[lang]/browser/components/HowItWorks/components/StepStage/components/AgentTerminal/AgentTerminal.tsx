import { Trans } from "@lingui/react/macro";

export function AgentTerminal() {
	return (
		<div className="absolute right-4 bottom-4 left-4 rounded-lg border border-border bg-background font-mono text-[11px] shadow-xl sm:right-auto sm:left-6 sm:w-[26rem]">
			<div className="flex h-7 items-center border-border border-b px-3 text-muted-foreground">
				claude
			</div>
			<div className="space-y-1 p-3 leading-relaxed">
				<p className="hidden text-muted-foreground sm:block">
					<span className="text-emerald-500">●</span>{" "}
					Edit(src/components/CTAButton.tsx)
				</p>
				<p className="truncate text-muted-foreground">
					<span className="text-emerald-500">●</span> Bash(superset browser
					screenshot --workspace $WS --pane $PANE --out after.png)
				</p>
				<p className="pl-3 text-emerald-500">└ Wrote after.png</p>
				<p className="text-foreground">
					<span className="text-foreground">●</span>{" "}
					<Trans>The button now stands out. I checked it in your pane.</Trans>
				</p>
			</div>
		</div>
	);
}
