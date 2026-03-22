export function InterruptedFooter() {
	return (
		<div className="flex items-center gap-2 text-xs text-muted-foreground">
			<span className="rounded border border-border bg-muted px-1.5 py-0.5 font-medium uppercase tracking-wide">
				Interrupted
			</span>
			<span>Response stopped</span>
		</div>
	);
}
