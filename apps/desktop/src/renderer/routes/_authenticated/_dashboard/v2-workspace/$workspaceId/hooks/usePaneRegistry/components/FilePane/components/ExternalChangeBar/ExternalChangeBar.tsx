interface ExternalChangeBarProps {
	onReload: () => Promise<void>;
}

export function ExternalChangeBar({ onReload }: ExternalChangeBarProps) {
	return (
		<div className="flex items-center gap-2 border-b border-border bg-warning/10 px-3 py-1.5 text-xs text-warning-foreground">
			<span>File changed on disk.</span>
			<button
				type="button"
				className="underline hover:no-underline"
				onClick={() => void onReload()}
			>
				Reload
			</button>
		</div>
	);
}
