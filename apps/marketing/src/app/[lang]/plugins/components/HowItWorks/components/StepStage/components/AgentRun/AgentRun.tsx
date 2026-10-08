import { Trans } from "@lingui/react/macro";

export function AgentRun() {
	return (
		<div className="absolute right-4 bottom-4 left-4 rounded-lg border border-border bg-background font-mono text-[11px] shadow-xl sm:right-auto sm:left-6 sm:w-96">
			<div className="flex h-7 items-center border-border border-b px-3 text-muted-foreground">
				claude
			</div>
			<div className="space-y-1 p-3 leading-relaxed">
				<p className="text-foreground">
					&gt; @linear <Trans>file a bug for the Safari login crash</Trans>
				</p>
				<p className="text-muted-foreground">
					<span className="text-emerald-500">●</span> Skill(file-issue)
				</p>
				<p className="text-muted-foreground">
					<span className="text-emerald-500">●</span> linear - save_issue (MCP)
				</p>
				<p className="pl-3 text-emerald-500">
					└ <Trans>Created ENG-142 Login fails on Safari</Trans>
				</p>
			</div>
		</div>
	);
}
