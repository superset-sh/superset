export function VscodeBetaDisabled() {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center">
			<h2 className="text-sm font-medium text-foreground">
				VS Code beta is disabled
			</h2>
			<p className="max-w-md text-xs text-muted-foreground select-text cursor-text">
				The embedded VS Code feature has been turned off. Re-enable it in{" "}
				<strong>Settings &gt; Behavior</strong> to use this tab, or close it.
			</p>
		</div>
	);
}
